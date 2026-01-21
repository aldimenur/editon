use fast_image_resize::{images::Image, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::codecs::webp::WebPEncoder;
use image::ExtendedColorType;
use image::ImageEncoder;
use image::ImageReader;
use rayon::prelude::*;
use rusqlite::{Connection, Result, ToSql};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::io::Cursor;
use std::num::NonZeroU32;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::default::get_probe;
use tauri::{AppHandle, Emitter};
use tauri::{Manager, State};
use uuid::Uuid;
use walkdir::WalkDir;
// Enum Metadata
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)] // Biar otomatis deteksi varian berdasarkan isi field-nya
pub enum AssetMetadata {
    Audio {
        sample_rate: u32,
        bitrate: u32,
        artist: Option<String>,
    },
    Video {
        width: u32,
        height: u32,
        fps: f32,
    },
    Image {
        width: u32,
        height: u32,
        format: String,
    },
    None,
}

#[derive(Clone, Serialize)]
struct ProgressEvent {
    current: usize,
    total: usize,
    filename: String,
    status: String, // "processing" atau "done"
}

// Struct Utama
#[derive(Debug, Serialize, Deserialize)]
pub struct Asset {
    pub id: Option<i64>, // Option karena saat insert ID belum ada (auto increment)
    pub uuid: String,
    pub filename: String,
    pub extension: String,
    pub original_path: String,
    pub type_name: String, // 'audio', 'video', 'image'

    pub thumbnail_path: Option<String>,
    pub thumbnail_blob: Option<Vec<u8>>,
    pub duration_sec: f64,
    pub file_size: i64,

    // Waveform disimpan sebagai bytes binary
    pub waveform_data: Option<Vec<f32>>,

    // Metadata fleksibel
    pub metadata: AssetMetadata,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse {
    pub data: Vec<Asset>,
    pub total_items: u64,
    pub total_pages: u64,
    pub current_page: u32,
}

pub struct DbState {
    pub conn: Arc<Mutex<Connection>>,
}

fn get_media_type(ext: &str) -> Option<String> {
    match ext.to_lowercase().as_str() {
        // Image
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "svg" | "ico" => {
            Some("image".to_string())
        }

        // Video
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "flv" | "wmv" => Some("video".to_string()),

        // Audio (Semua jenis suara jadi satu)
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" | "wma" | "aiff" => {
            Some("audio".to_string())
        }

        _ => None, // File lain diabaikan
    }
}

#[tauri::command]
fn clear_db(state: State<'_, DbState>) -> Result<String, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM assets", [])
        .map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM sqlite_sequence WHERE name='assets'", [])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok("Database cleared".to_string())
}

#[tauri::command]
fn scan_and_import_folder(
    state: State<'_, DbState>,
    folder_path: String,
) -> Result<String, String> {
    // Lock database
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    // A. Mulai Transaksi (Wajib biar cepat)
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut count = 0;

    {
        // B. Siapkan Query
        // Gunakan INSERT OR IGNORE: Jika file dengan path yang sama sudah ada, skip (tidak error).
        let mut stmt = tx
            .prepare_cached(
                "INSERT OR IGNORE INTO assets 
            (uuid, filename, extension, original_path, type, file_size, metadata, duration_sec) 
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )
            .map_err(|e| e.to_string())?;

        // C. Loop Folder (Recursive)
        for entry in WalkDir::new(&folder_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();

            if path.is_file() {
                // Ambil ekstensi
                if let Some(ext_os) = path.extension() {
                    let ext_str = ext_os.to_string_lossy().to_string();

                    // Cek tipe (Image/Video/Audio)
                    if let Some(media_type) = get_media_type(&ext_str) {
                        // Siapkan data dasar
                        let filename = path.file_name().unwrap().to_string_lossy().to_string();
                        let path_str = path.to_string_lossy().to_string();
                        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let uuid = Uuid::new_v4().to_string();

                        // Eksekusi Insert
                        // Data berat (waveform, duration) diisi default dulu (0 atau kosong)
                        stmt.execute(rusqlite::params![
                            uuid,             // ?1
                            filename,         // ?2
                            ext_str,          // ?3
                            path_str,         // ?4
                            media_type,       // ?5 ('audio', 'video', 'image')
                            file_size as i64, // ?6
                            "{}",             // ?7 Metadata JSON (kosong)
                            0.0,              // ?8 Duration (0 detik)
                        ])
                        .map_err(|e| e.to_string())?;

                        count += 1;
                    }
                }
            }
        }
    } // Statement didrop di sini

    // D. Commit Transaksi (Simpan permanen)
    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!("Berhasil scan: {} file baru ditambahkan.", count))
}

#[tauri::command]
// 1. Ubah return type agar mengembalikan angka (u64)
fn get_count_assets(state: State<'_, DbState>, asset_type: String) -> Result<u64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 2. Gunakan query_row untuk mengambil hasil SELECT COUNT
    let count: i64 = if asset_type == "all" {
        conn.query_row("SELECT COUNT(*) FROM assets", [], |row| row.get(0))
            .map_err(|e| e.to_string())?
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM assets WHERE type = ?1",
            [asset_type],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };

    // 3. Kembalikan hasilnya
    Ok(count as u64)
}

#[tauri::command]
fn get_assets_paginated(
    state: State<'_, DbState>,
    page: u32,
    page_size: u32,
    query: String,      // Search keyword (kosong string jika tidak search)
    asset_type: String, // Filter: 'all', 'audio', 'video', 'image', 'sfx'
) -> Result<PaginatedResponse, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 1. Bangun Query Builder Dinamis (WHERE Clause)
    let mut sql_base = "FROM assets WHERE 1=1".to_string();
    let mut params_values: Vec<Box<dyn ToSql>> = Vec::new(); // Penampung parameter

    // Filter A: Search Query (Filename)
    if !query.trim().is_empty() {
        sql_base.push_str(" AND filename LIKE ?");
        let wildcard = format!("%{}%", query);
        params_values.push(Box::new(wildcard));
    }

    // Filter B: Asset Type (Enum)
    if asset_type != "all" {
        sql_base.push_str(" AND type = ?");
        params_values.push(Box::new(asset_type));
    }

    // ---------------------------------------------------------
    // 2. Hitung Total Data (Untuk Pagination Info)
    // ---------------------------------------------------------
    let sql_count = format!("SELECT COUNT(*) {}", sql_base);

    // Rusqlite butuh slice of references &[&dyn ToSql], kita convert dari Vec<Box>
    let params_refs: Vec<&dyn ToSql> = params_values.iter().map(|p| p.as_ref()).collect();

    let total_items: u64 = conn
        .query_row(&sql_count, params_refs.as_slice(), |row| {
            row.get::<_, i64>(0).map(|x| x as u64)
        })
        .map_err(|e| format!("Gagal hitung total: {}", e))?;

    let total_pages = (total_items as f64 / page_size as f64).ceil() as u64;

    // ---------------------------------------------------------
    // 3. Ambil Data (LIMIT & OFFSET)
    // ---------------------------------------------------------
    // Offset: (Halaman 1 -> 0), (Halaman 2 -> 20), dst.
    let offset = (page.max(1) - 1) * page_size;

    let sql_data = format!(
        "SELECT id, uuid, filename, extension, original_path, type, 
                thumbnail_path, duration_sec, file_size, waveform_data, metadata, thumbnail_blob
         {} 
         ORDER BY id ASC 
         LIMIT {} OFFSET {}",
        sql_base, page_size, offset
    );

    let mut stmt = conn.prepare(&sql_data).map_err(|e| e.to_string())?;

    // Query map
    let asset_iter = stmt
        .query_map(params_refs.as_slice(), |row| {
            // Parsing JSON manual dari String DB ke Struct Rust
            let waveform_str: String = row.get("waveform_data").unwrap_or("[]".to_string());
            let metadata_str: String = row.get("metadata").unwrap_or("{}".to_string());

            Ok(Asset {
                id: row.get("id")?,
                uuid: row.get("uuid")?,
                filename: row.get("filename")?,
                extension: row.get("extension")?,
                original_path: row.get("original_path")?,
                type_name: row.get("type")?,
                thumbnail_path: row.get("thumbnail_path")?,
                duration_sec: row.get("duration_sec")?,
                thumbnail_blob: row.get("thumbnail_blob")?,
                file_size: row.get("file_size")?,
                waveform_data: serde_json::from_str(&waveform_str).unwrap_or_default(),
                metadata: serde_json::from_str(&metadata_str).unwrap_or(AssetMetadata::None),
            })
        })
        .map_err(|e| e.to_string())?;

    // Collect hasil
    let mut data = Vec::new();
    for asset in asset_iter {
        data.push(asset.map_err(|e| e.to_string())?);
    }

    // 4. Return Hasil Lengkap
    Ok(PaginatedResponse {
        data,
        total_items,
        total_pages,
        current_page: page,
    })
}

fn get_audio_waveform(path: &str, num_bars: usize) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
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
fn generate_missing_waveforms(app: AppHandle, state: State<'_, DbState>) -> Result<String, String> {
    // 1. Ambil koneksi DB sebentar untuk mencari "PR" (Pekerjaan Rumah)
    let db_arc = state.conn.clone(); // Clone Arc (murah, cuma copy pointer)

    let to_process: Vec<(String, String, String)> = {
        let conn = db_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                // Cari file audio yang waveform-nya masih default '[]' atau NULL
                "SELECT uuid, original_path, filename FROM assets 
             WHERE type = 'audio' AND (waveform_data = '[]' OR waveform_data IS NULL)",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // uuid
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

        to_process
            .par_iter()
            .enumerate()
            .for_each(|(_, (uuid, path, filename))| {
                let current = processed_count.fetch_add(1, Ordering::SeqCst) + 1;
                // A. Emit Event: "Sedang memproses lagu X..."
                let _ = app.emit(
                    "waveform-progress",
                    ProgressEvent {
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
                                "UPDATE assets SET waveform_data = ?1 WHERE uuid = ?2",
                                [&json_data, uuid],
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

// Hapus decorator #[command] karena ini akan dipanggil internal oleh thread, bukan frontend
pub fn generate_thumbnail_buffer(path: &str, target_width: u32) -> Result<Vec<u8>, String> {
    // 1. Buka File (Gunakan BufReader untuk sedikit optimasi I/O)
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    // 2. Decode ke RGBA8
    let img = ImageReader::new(reader)
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?
        .to_rgba8();

    let width = NonZeroU32::new(img.width()).ok_or("Width 0")?;
    let height = NonZeroU32::new(img.height()).ok_or("Height 0")?;

    // 3. Setup Fast Image Resize
    let src_view = fast_image_resize::images::ImageRef::new(
        width.get(),
        height.get(),
        img.as_raw(),
        PixelType::U8x4,
    )
    .map_err(|e| e.to_string())?;

    let aspect_ratio = width.get() as f32 / height.get() as f32;
    let target_height = (target_width as f32 / aspect_ratio) as u32;
    let dst_width = NonZeroU32::new(target_width).ok_or("Target width 0")?;
    let dst_height = NonZeroU32::new(target_height).ok_or("Target height 0")?;

    let mut dst_image = Image::new(dst_width.get(), dst_height.get(), PixelType::U8x4);

    // 4. Resize (Nearest Neighbor untuk kecepatan maksimal)
    let mut resizer = Resizer::new();
    resizer
        .resize(
            &src_view,
            &mut dst_image,
            &ResizeOptions::new().resize_alg(ResizeAlg::Nearest),
        )
        .map_err(|e| e.to_string())?;

    // 5. Encode ke WebP (Raw Bytes)
    let mut buffer = Cursor::new(Vec::new());
    let encoder = WebPEncoder::new_lossless(&mut buffer); // Lossy

    encoder
        .write_image(
            dst_image.buffer(),
            target_width,
            target_height,
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;

    // Return Vec<u8> (BLOB siap simpan ke SQLite)
    Ok(buffer.into_inner())
}

#[tauri::command]
fn generate_missing_thumbnails(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
) -> Result<String, String> {
    let db_arc = state.conn.clone();

    // 1. Tentukan lokasi folder thumbnail di AppData
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumbnails_dir = app_data_dir.join("thumbnails");

    // Pastikan folder thumbnails sudah ada
    if !thumbnails_dir.exists() {
        std::fs::create_dir_all(&thumbnails_dir).map_err(|e| e.to_string())?;
    }
    // 2. Ambil daftar file (khusus image) yang thumbnail_blob-nya masih kosong/NULL
    let to_process: Vec<(String, String, String)> = {
        let conn = db_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT uuid, original_path, filename FROM assets 
             WHERE (thumbnail_blob IS NULL OR length(thumbnail_blob) = 0)
             AND type = 'image'", // Untuk saat ini kita fokus ke image
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?, // uuid
                    row.get::<_, String>(1)?, // path
                    row.get::<_, String>(2)?, // filename
                ))
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let total_files = to_process.len();
    if total_files == 0 {
        return Ok("Semua thumbnail sudah lengkap.".to_string());
    }
    // 2. Buat counter atomic
    let processed_count = std::sync::Arc::new(AtomicUsize::new(0));
    // 3. Jalankan proses di background thread
    std::thread::spawn(move || {
        to_process
            .par_iter()
            .enumerate()
            .for_each(|(_, (uuid, path, filename))| {
                let current = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

                let _ = app.emit(
                    "thumbnail-progress",
                    ProgressEvent {
                        current,
                        total: total_files,
                        filename: filename.clone(),
                        status: "processing".to_string(),
                    },
                );

                match generate_thumbnail_buffer(path, 200) {
                    Ok(blob) => {
                        // Simpan blob ke file system
                        let thumb_filename = format!("{}.webp", uuid);
                        let thumb_path = thumbnails_dir.join(&thumb_filename);
                        let thumb_path_str = thumb_path.to_string_lossy().to_string();

                        if let Ok(_) = std::fs::write(&thumb_path, &blob) {
                            // Update database: simpan path-nya dan hapus blob untuk menghemat space DB
                            if let Ok(conn) = db_arc.lock() {
                                let _ = conn.execute(
                                    "UPDATE assets SET thumbnail_path = ?1 WHERE uuid = ?2",
                                    rusqlite::params![thumb_path_str, uuid],
                                );
                            }
                        }
                    }
                    Err(e) => {
                        println!("Gagal generate thumbnail untuk {}: {}", filename, e);
                    }
                }
            });
        // D. Emit selesai
        let _ = app.emit(
            "thumbnail-progress",
            ProgressEvent {
                current: total_files,
                total: total_files,
                filename: "Selesai!".to_string(),
                status: "done".to_string(),
            },
        );
    });

    Ok(format!(
        "Memulai proses background untuk {} thumbnail...",
        total_files
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let total_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let rayon_thread = (total_cores / 2).max(1);

    println!(
        "Cpu memiliki {} threads. Rayon menggunakan {} threads",
        total_cores, rayon_thread
    );

    rayon::ThreadPoolBuilder::new()
        .num_threads(rayon_thread)
        .build_global()
        .unwrap();
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // A. Tentukan lokasi database (di folder AppData user)
            let app_data_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data_dir).unwrap();
            let db_path = app_data_dir.join("editon.db");

            // B. Buka Koneksi baru
            let conn = Connection::open(&db_path).unwrap();

            // D. Aktifkan WAL Mode (Write-Ahead Logging) dan performa setting
            conn.pragma_update(None, "journal_mode", "WAL").unwrap();
            conn.pragma_update(None, "synchronous", "NORMAL").unwrap();
            // E. Buat tabel baru jika belum ada
            conn.execute(
                "CREATE TABLE IF NOT EXISTS assets (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    uuid            TEXT NOT NULL UNIQUE,
                    filename        TEXT NOT NULL,
                    extension       TEXT NOT NULL,
                    original_path   TEXT NOT NULL UNIQUE,
                    type            TEXT NOT NULL,
                    thumbnail_path  TEXT,
                    thumbnail_blob  BLOB,
                    duration_sec    REAL DEFAULT 0,
                    file_size       INTEGER NOT NULL,
                    waveform_data   TEXT,
                    metadata        TEXT
                )",
                [],
            )?;

            // F. Buat index baru (gunakan IF NOT EXISTS supaya tidak error)
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_path_type 
                 ON assets(original_path, type)",
                [],
            )?;

            // G. Simpan koneksi ke State Tauri
            app.manage(DbState {
                conn: Arc::new(Mutex::new(conn)),
            });

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            clear_db,
            scan_and_import_folder,
            generate_missing_waveforms,
            get_assets_paginated,
            generate_missing_thumbnails,
            get_count_assets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
