use futures_util::StreamExt;
use reqwest::Client;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Emitter, Window};
use tokio::process::Command;
use zip::ZipArchive;

use crate::utils::get_app_data_dir;

const MIN_DENO_ZIP_BYTES: u64 = 1_000_000;
const MIN_DENO_EXE_BYTES: u64 = 5_000_000;

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

async fn fetch_expected_sha256(client: &Client, url: &str) -> Result<String, String> {
    let checksum_candidates = [format!("{}.sha256sum", url), format!("{}.sha256", url)];

    for checksum_url in checksum_candidates {
        let response = match client.get(&checksum_url).send().await {
            Ok(resp) if resp.status().is_success() => resp,
            _ => continue,
        };

        let body = response
            .text()
            .await
            .map_err(|e| format!("failed to read checksum response: {}", e))?;

        if let Some(hash) = parse_sha256_hex(&body) {
            return Ok(hash);
        }
    }

    Err("checksum file unavailable or invalid".to_string())
}

pub async fn download_deno(app: AppHandle, window: Window) -> Result<String, String> {
    let bin_dir = get_app_data_dir(&app)?;
    fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    if !cfg!(target_os = "windows") {
        return Err(
            "Deno auto-download only supported on Windows. Please install manually.".to_string(),
        );
    }

    let zip_path = bin_dir.join("deno.zip");
    let urls = [
        "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip",
        "https://dl.deno.land/release-latest/deno-x86_64-pc-windows-msvc.zip",
    ];

    let client = Client::builder()
        .user_agent("Editon/0.2.2")
        .build()
        .map_err(|e| e.to_string())?;

    let mut last_error = String::from("Unknown download error");

    for url in urls {
        let result = download_deno_zip(&client, url, &zip_path, &window).await;
        match result {
            Ok(()) => {
                let expected_sha = match fetch_expected_sha256(&client, url).await {
                    Ok(hash) => hash,
                    Err(e) => {
                        fs::remove_file(&zip_path).ok();
                        last_error = format!("checksum error: {} (url: {})", e, url);
                        continue;
                    }
                };

                let actual_sha = match sha256_file(&zip_path) {
                    Ok(hash) => hash,
                    Err(e) => {
                        fs::remove_file(&zip_path).ok();
                        last_error = format!("checksum read error: {} (url: {})", e, url);
                        continue;
                    }
                };

                if expected_sha != actual_sha {
                    fs::remove_file(&zip_path).ok();
                    last_error = format!("checksum mismatch (url: {})", url);
                    continue;
                }

                let extract_result = extract_deno_exe_from_zip(&zip_path, &bin_dir);
                fs::remove_file(&zip_path).ok();

                return match extract_result {
                    Ok(deno_path) => Ok(format!("Deno installed:\n{}", deno_path.display())),
                    Err(e) => Err(e),
                };
            }
            Err(e) => {
                fs::remove_file(&zip_path).ok();
                last_error = format!("{} (url: {})", e, url);
            }
        }
    }

    match install_deno_via_powershell(&bin_dir).await {
        Ok(deno_path) => Ok(format!(
            "Deno installed via PowerShell installer:\n{}",
            deno_path.display()
        )),
        Err(ps_error) => Err(format!(
            "Failed to download Deno from direct URLs: {}. PowerShell fallback also failed: {}",
            last_error, ps_error
        )),
    }
}

fn extract_deno_exe_from_zip(zip_path: &Path, bin_dir: &Path) -> Result<PathBuf, String> {
    let zip_file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(zip_file).map_err(|e| e.to_string())?;

    let mut deno_exe: Option<PathBuf> = None;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name().to_string();

        if name.ends_with("deno.exe") {
            let out = bin_dir.join("deno.exe");
            let mut out_file = fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut out_file).map_err(|e| e.to_string())?;
            deno_exe = Some(out);
            break;
        }
    }

    let deno_path = deno_exe.ok_or_else(|| "Failed to extract deno.exe".to_string())?;
    validate_deno_exe(&deno_path)?;
    Ok(deno_path)
}

async fn download_deno_zip(
    client: &Client,
    url: &str,
    zip_path: &PathBuf,
    window: &Window,
) -> Result<(), String> {
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("http status {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file = fs::File::create(zip_path).map_err(|e| format!("create zip failed: {}", e))?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("stream error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("write zip failed: {}", e))?;

        downloaded += chunk.len() as u64;
        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64) * 100.0
        } else {
            0.0
        };
        window
            .emit("deno-download-progress", progress.round() as u64)
            .ok();
    }

    file.flush().map_err(|e| format!("flush zip failed: {}", e))?;

    if downloaded < MIN_DENO_ZIP_BYTES {
        return Err(format!(
            "downloaded file is too small: {} bytes",
            downloaded
        ));
    }

    Ok(())
}

async fn install_deno_via_powershell(bin_dir: &PathBuf) -> Result<PathBuf, String> {
    let script = "irm https://deno.land/install.ps1 | iex";

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ])
        .env("DENO_INSTALL", bin_dir)
        .output()
        .await
        .map_err(|e| format!("failed to start powershell installer: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Err(format!(
            "installer exited with status {}. stdout: {} stderr: {}",
            output.status, stdout, stderr
        ));
    }

    let candidate_paths = [
        bin_dir.join("deno.exe"),
        bin_dir.join("bin").join("deno.exe"),
        std::env::var("USERPROFILE")
            .map(|p| PathBuf::from(p).join(".deno").join("bin").join("deno.exe"))
            .unwrap_or_else(|_| PathBuf::from("")),
    ];

    for candidate in candidate_paths {
        if candidate.as_os_str().is_empty() {
            continue;
        }

        if candidate.exists() {
            let final_path = bin_dir.join("deno.exe");
            if candidate != final_path {
                fs::copy(&candidate, &final_path)
                    .map_err(|e| format!("failed to copy deno.exe from installer path: {}", e))?;
                validate_deno_exe(&final_path)?;
                return Ok(final_path);
            }

            validate_deno_exe(&candidate)?;
            return Ok(candidate);
        }
    }

    Err("installer completed but deno.exe was not found".to_string())
}

fn validate_deno_exe(deno_path: &PathBuf) -> Result<(), String> {
    let metadata = fs::metadata(deno_path)
        .map_err(|e| format!("failed to stat deno.exe at {}: {}", deno_path.display(), e))?;

    if metadata.len() < MIN_DENO_EXE_BYTES {
        return Err(format!(
            "deno.exe looks invalid ({} bytes) at {}",
            metadata.len(),
            deno_path.display()
        ));
    }

    Ok(())
}
