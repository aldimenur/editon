use std::{
    fs::File,
    path::Path,
    sync::atomic::{AtomicUsize, Ordering},
};

use rayon::iter::{IntoParallelRefIterator, ParallelIterator};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::get_probe;
use tauri::{AppHandle, Emitter, State};

use crate::{models::ProgressEvent, DbState};

pub fn get_audio_waveform(
    path: &str,
    num_bars: usize,
) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
    let src = File::open(Path::new(path))?;
    let mss = MediaSourceStream::new(Box::new(src), Default::default());
    let hint = Hint::new();
    let probed = get_probe().format(
        &hint,
        mss,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    )?;
    let mut format = probed.format;
    let track = format.default_track().ok_or("No default track")?;
    let track_id = track.id;

    let mut decoder =
        symphonia::default::get_codecs().make(&track.codec_params, &DecoderOptions::default())?;

    // Kita kumpulkan peak dari setiap paket audio (Streaming)
    // Ini JAUH lebih hemat RAM daripada menyimpan semua sample
    let mut packet_peaks: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(Error::IoError(_)) => break,
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let duration = decoded.capacity() as u64;

                // Gunakan buffer sementara untuk satu paket saja
                let mut sample_buf = SampleBuffer::<f32>::new(duration, spec);
                sample_buf.copy_interleaved_ref(decoded);
                let samples = sample_buf.samples();

                // Cari peak di paket ini saja
                let mut p_max = 0.0f32;
                for &s in samples {
                    let abs_s = s.abs();
                    if abs_s > p_max {
                        p_max = abs_s;
                    }
                }
                packet_peaks.push(p_max);
            }
            Err(_) => break,
        }
    }

    if packet_peaks.is_empty() {
        return Ok(vec![0.0; num_bars]);
    }

    // 2. Resample packet_peaks menjadi tepat num_bars (thumbnail size)
    let chunk_size = (packet_peaks.len() as f32 / num_bars as f32).max(1.0);
    let mut waveform = Vec::with_capacity(num_bars);

    for i in 0..num_bars {
        let start = (i as f32 * chunk_size) as usize;
        let end = ((i + 1) as f32 * chunk_size) as usize;

        let mut peak = 0.0f32;
        for j in start..end.min(packet_peaks.len()) {
            if packet_peaks[j] > peak {
                peak = packet_peaks[j];
            }
        }
        waveform.push(peak);
    }

    Ok(waveform)
    // Kecepatan Maksimal: Ini adalah jalur eksekusi paling pendek. Decoding -> Peak Paket -> Resample -> Selesai.
}

#[tauri::command]
pub fn generate_missing_waveforms(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<String, String> {
    // 1. Ambil koneksi DB sebentar untuk mencari "PR" (Pekerjaan Rumah)
    let db_arc = state.conn.clone(); // Clone Arc (murah, cuma copy pointer)

    state.cancel_scan.store(false, Ordering::SeqCst);
    let cancel_flag = state.cancel_scan.clone();

    let to_process: Vec<(i64, String, String)> = {
        let conn = db_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                // Cari file audio yang waveform-nya masih default '[]' atau NULL
                "SELECT id, original_path, filename FROM assets 
             WHERE type = 'audio' AND (waveform_data = '[]' OR waveform_data IS NULL)",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,    // id
                    row.get::<_, String>(1)?, // path
                    row.get::<_, String>(2)?, // filename
                ))
            })
            .map_err(|e| e.to_string())?;

        // Ubah iterator jadi Vector agar lock DB bisa segera dilepas
        rows.filter_map(|r| r.ok()).collect()
    };

    let total_files = to_process.len();
    if total_files == 0 {
        return Ok("Semua waveform sudah lengkap.".to_string());
    }

    let processed_count = std::sync::Arc::new(AtomicUsize::new(0));

    // 2. Jalankan Proses di Thread Terpisah (BACKGROUND)
    std::thread::spawn(move || {
        println!("Background process started for {} files", total_files);

        to_process.par_iter().for_each(|(id, path, filename)| {
            // Check cancel flag FIRST before processing
            if cancel_flag.load(Ordering::SeqCst) {
                return;
            }

            let current = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

            // A. Emit Event: "Sedang memproses lagu X..."
            let _ = app.emit(
                "waveform-progress",
                ProgressEvent {
                    name: "Sound".to_string(),
                    current,
                    total: total_files,
                    filename: filename.clone(),
                    status: "processing".to_string(),
                },
            );

            // B. Proses Berat (Decode Audio) - Tidak mengunci DB
            // Ingat: function get_audio_waveform kita sudah return Vec<f32> (-1 s/d 1)
            let waveform_result = get_audio_waveform(path, 100);

            match waveform_result {
                Ok(data) => {
                    let json_data = serde_json::to_string(&data).unwrap_or("[]".to_string());

                    // C. Update DB (Hanya lock sebentar saat update row ini saja)
                    if let Ok(conn) = db_arc.lock() {
                        let _ = conn.execute(
                            "UPDATE assets SET waveform_data = ?1 WHERE id = ?2",
                            rusqlite::params![json_data, id],
                        );
                    }
                }
                Err(e) => {
                    println!("Gagal process {}: {}", filename, e);
                    // Lanjut ke file berikutnya meski error
                }
            }
        });

        // D. Emit Event Selesai
        let _ = app.emit(
            "waveform-progress",
            ProgressEvent {
                name: "Sound".to_string(),
                current: total_files,
                total: total_files,
                filename: "Selesai!".to_string(),
                status: "done".to_string(),
            },
        );
    });

    // Command utama langsung return, tidak menunggu thread selesai
    Ok(format!(
        "Memulai proses background untuk {} file...",
        total_files
    ))
}
