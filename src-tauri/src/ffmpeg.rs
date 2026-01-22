use std::{fs, path::PathBuf};

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Window};
use zip::ZipArchive;

use crate::get_app_data_dir;

pub async fn download_ffmpeg(
    app: AppHandle,
    window: Window,
) -> Result<String, String> {
    let bin_dir = get_app_data_dir(&app)?;

    fs::create_dir_all(&bin_dir)
        .map_err(|e| e.to_string())?;

    // PLATFORM HANDLING
    if cfg!(target_os = "windows") {
        // Static build (pin version)
        let url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
        let zip_path = bin_dir.join("ffmpeg-master-latest-win64-gpl.zip");

        // DOWNLOAD
        let response = reqwest::get(url)
            .await
            .map_err(|e| e.to_string())?;

        let total_size = response
            .content_length()
            .ok_or("Failed to get content length")?;

        let mut downloaded: u64 = 0;
        let mut bytes: Vec<u8> = Vec::with_capacity(total_size as usize);
        let mut stream = response.bytes_stream();

        println!("Download ffmpeg started!");

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;
            bytes.extend_from_slice(&chunk);

            // Emit progress ke frontend (optional)
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            let _ = window.emit(
                "ffmpeg-download-progress",
                progress.round() as u64,
            );
        }

        fs::write(&zip_path, bytes)
            .map_err(|e| e.to_string())?;

        // EXTRACT ZIP
        let zip_file = fs::File::open(&zip_path)
            .map_err(|e| e.to_string())?;

        let mut archive = ZipArchive::new(zip_file)
            .map_err(|e| e.to_string())?;

        let mut ffmpeg_exe: Option<PathBuf> = None;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            let name = file.name().to_string();

            // Cari ffmpeg.exe di dalam zip
            if name.ends_with("ffmpeg.exe") {
                let out_path = bin_dir.join("ffmpeg.exe");
                let mut out_file = fs::File::create(&out_path)
                    .map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut out_file)
                    .map_err(|e| e.to_string())?;

                ffmpeg_exe = Some(out_path);
                break;
            }
        }

        fs::remove_file(zip_path).ok();

        match ffmpeg_exe {
            Some(path) => Ok(format!(
                "FFmpeg downloaded successfully: {}",
                path.display()
            )),
            None => Err("ffmpeg.exe not found in archive".to_string()),
        }
    }
    else if cfg!(target_os = "macos") {
        Err(
            "FFmpeg not bundled on macOS. Please install via Homebrew:\n\nbrew install ffmpeg"
                .to_string(),
        )
    }
    else {
        Err(
            "FFmpeg not bundled on Linux. Please install via your package manager."
                .to_string(),
        )
    }
}