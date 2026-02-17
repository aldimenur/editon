use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::{fs, io::Read, io::Write, path::Path, path::PathBuf};
use tauri::{AppHandle, Emitter, Window};
use zip::ZipArchive;

use crate::utils::get_app_data_dir;

fn parse_sha256_hex(input: &str) -> Option<String> {
    for token in input.split_whitespace() {
        if token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit()) {
            return Some(token.to_lowercase());
        }
    }
    None
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

async fn fetch_expected_sha256(url: &str) -> Result<String, String> {
    let checksum_url = format!("{}.sha256", url);
    let body = reqwest::get(&checksum_url)
        .await
        .map_err(|e| format!("Failed to fetch checksum file: {}", e))?
        .text()
        .await
        .map_err(|e| format!("Failed to read checksum response: {}", e))?;

    parse_sha256_hex(&body).ok_or("Checksum file does not contain a valid SHA256".to_string())
}

pub async fn download_ffmpeg(app: AppHandle, window: Window) -> Result<String, String> {
    let bin_dir = get_app_data_dir(&app)?;
    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    if !cfg!(target_os = "windows") {
        return Err(
            "FFmpeg auto-download only supported on Windows. Please install manually.".to_string(),
        );
    }

    let url =
        "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip";
    let zip_path = bin_dir.join("ffmpeg.zip");

    // === DOWNLOAD (stream to file) ===
    let response = reqwest::get(url).await.map_err(|e| e.to_string())?;
    let total_size = response
        .content_length()
        .ok_or("Failed to get content length")?;

    let mut downloaded: u64 = 0;
    let mut file = fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;

        downloaded += chunk.len() as u64;
        let progress = (downloaded as f64 / total_size as f64) * 100.0;
        window
            .emit("ffmpeg-download-progress", progress.round() as u64)
            .ok();
    }

    file.flush().map_err(|e| e.to_string())?;

    let expected_sha = fetch_expected_sha256(url).await?;
    let actual_sha = sha256_file(&zip_path)?;
    if expected_sha != actual_sha {
        let _ = fs::remove_file(&zip_path);
        return Err("FFmpeg checksum verification failed".to_string());
    }

    // === EXTRACT ===
    let zip_file = fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(zip_file).map_err(|e| e.to_string())?;

    let mut ffmpeg_exe: Option<PathBuf> = None;
    let mut ffprobe_exe: Option<PathBuf> = None;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        if name.ends_with("ffmpeg.exe") {
            let out = bin_dir.join("ffmpeg.exe");
            let mut out_file = fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
            ffmpeg_exe = Some(out);
        }

        if name.ends_with("ffprobe.exe") {
            let out = bin_dir.join("ffprobe.exe");
            let mut out_file = fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
            ffprobe_exe = Some(out);
        }
    }

    fs::remove_file(zip_path).ok();

    match (ffmpeg_exe, ffprobe_exe) {
        (Some(ffmpeg), Some(ffprobe)) => Ok(format!(
            "FFmpeg installed:\n{}\n{}",
            ffmpeg.display(),
            ffprobe.display()
        )),
        _ => Err("Failed to extract ffmpeg or ffprobe".to_string()),
    }
}
