use reqwest::{self};
use std::fs;
use tauri::{AppHandle, Emitter};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::Command,
};

use crate::utils::get_app_data_dir;

#[derive(serde::Serialize)]
pub struct DependencyStatus {
    yt_dlp_installed: bool,
    ffmpeg_installed: bool,
    ffprobe_installed: bool,
    yt_dlp_path: Option<String>,
    ffmpeg_path: Option<String>,
    ffprobe_path: Option<String>,
}

// Cek status dependency
#[tauri::command]
pub async fn check_dependencies(app: AppHandle) -> Result<DependencyStatus, String> {
    let bin_dir = get_app_data_dir(&app)?;

    let yt_dlp_name = if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };

    let ffmpeg_name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };

    let ffprobe_name = if cfg!(target_os = "windows") {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };

    let yt_dlp_path = bin_dir.join(yt_dlp_name);
    let ffmpeg_path = bin_dir.join(ffmpeg_name);
    let ffprobe_path = bin_dir.join(ffprobe_name);

    Ok(DependencyStatus {
        yt_dlp_installed: yt_dlp_path.exists(),
        ffmpeg_installed: ffmpeg_path.exists(),
        ffprobe_installed: ffprobe_path.exists(),
        yt_dlp_path: if yt_dlp_path.exists() {
            Some(yt_dlp_path.to_string_lossy().to_string())
        } else {
            None
        },
        ffmpeg_path: if ffmpeg_path.exists() {
            Some(ffmpeg_path.to_string_lossy().to_string())
        } else {
            None
        },
        ffprobe_path: if ffmpeg_path.exists() {
            Some(ffprobe_path.to_string_lossy().to_string())
        } else {
            None
        },
    })
}

// Download yt-dlp
pub async fn download_ytdlp(app: AppHandle, window: tauri::Window) -> Result<String, String> {
    let bin_dir = get_app_data_dir(&app)?;

    let (url, filename) = if cfg!(target_os = "windows") {
        (
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe",
            "yt-dlp.exe",
        )
    } else if cfg!(target_os = "macos") {
        (
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos",
            "yt-dlp",
        )
    } else {
        (
            "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
            "yt-dlp",
        )
    };

    let dest_path = bin_dir.join(filename);

    // Download file
    let client = reqwest::Client::new();
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download: {}", e))?;

    let total_size = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut file =
        fs::File::create(&dest_path).map_err(|e| format!("Failed to create file: {}", e))?;

    use std::io::Write;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Error reading chunk: {}", e))?
    {
        file.write_all(&chunk)
            .map_err(|e| format!("Error writing to file: {}", e))?;

        downloaded += chunk.len() as u64;

        // Emit progress event (Tauri v2 API)
        let progress = if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0) as u32
        } else {
            0
        };

        let _ = window.emit(
            "yt-dlp-download-progress",
            serde_json::json!({
                "tool": "yt-dlp",
                "progress": progress,
                "downloaded": downloaded,
                "total": total_size
            }),
        );
    }

    // Set executable permission on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&dest_path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?
            .permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&dest_path, perms)
            .map_err(|e| format!("Failed to set permissions: {}", e))?;
    }

    Ok(dest_path.to_string_lossy().to_string())
}

// Cek versi yt-dlp yang terinstall
#[tauri::command]
pub async fn get_ytdlp_version(app: AppHandle) -> Result<String, String> {
    let status = check_dependencies(app.clone()).await?;

    if !status.yt_dlp_installed {
        return Err("yt-dlp is not installed".to_string());
    }

    let yt_dlp_path = status.yt_dlp_path.unwrap();

    use std::process::Command;

    let output = Command::new(&yt_dlp_path)
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to get version: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(version)
    } else {
        Err("Failed to get version".to_string())
    }
}

// Cek versi latest yt-dlp dari GitHub
// #[tauri::command]
// async fn get_ytdlp_latest_version() -> Result<String, String> {
//     let client = reqwest::Client::new();

//     let response = client
//         .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
//         .header("User-Agent", "Tauri-App")
//         .send()
//         .await
//         .map_err(|e| format!("Failed to fetch latest version: {}", e))?;

//     let json: serde_json::Value = response
//         .json::<serde_json::Value>()
//         .await
//         .map_err(|e| format!("Failed to parse response: {}", e))?;

//     let tag_name = json["tag_name"]
//         .as_str()
//         .ok_or("Tag name not found")?
//         .to_string();

//     Ok(tag_name)
// }

// #[derive(serde::Serialize)]
// struct VersionInfo {
//     current: Option<String>,
//     latest: String,
//     update_available: bool,
// }

// // Cek apakah ada update tersedia
// #[tauri::command]
// async fn check_ytdlp_update(app: AppHandle) -> Result<VersionInfo, String> {
//     let latest = get_ytdlp_latest_version().await?;

//     let current = match get_ytdlp_version(app).await {
//         Ok(v) => Some(v),
//         Err(_) => None,
//     };

//     let update_available = if let Some(ref curr) = current {
//         curr != &latest
//     } else {
//         true
//     };

//     Ok(VersionInfo {
//         current,
//         latest,
//         update_available,
//     })
// }

// Update yt-dlp (hapus yang lama, download yang baru)
#[tauri::command]
pub async fn update_ytdlp(app: AppHandle, window: tauri::Window) -> Result<String, String> {
    let bin_dir = get_app_data_dir(&app)?;

    let filename = if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };

    let dest_path = bin_dir.join(filename);

    // Backup old version (optional)
    if dest_path.exists() {
        let backup_path = bin_dir.join(format!("{}.backup", filename));
        fs::rename(&dest_path, &backup_path)
            .map_err(|e| format!("Failed to backup old version: {}", e))?;
    }

    // Download new version (reuse download_ytdlp logic)
    match download_ytdlp(app, window).await {
        Ok(path) => Ok(path),
        Err(e) => {
            // Restore backup if download failed
            let backup_path = bin_dir.join(format!("{}.backup", filename));
            if backup_path.exists() {
                let _ = fs::rename(&backup_path, &dest_path);
            }
            Err(e)
        }
    }
}

// Run yt-dlp command
#[tauri::command]
pub async fn run_ytdlp(
    app: AppHandle,
    args: Vec<String>,
    window: tauri::Window,
) -> Result<String, String> {
    let status = check_dependencies(app.clone()).await?;

    if !status.yt_dlp_installed {
        return Err("yt-dlp is not installed. Please install it first.".to_string());
    }

    let yt_dlp_path = status.yt_dlp_path.unwrap();

    let mut cmd = Command::new(&yt_dlp_path);
    cmd.args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn yt-dlp: {}", e))?;

    if let Some(mut stdout) = child.stdout.take() {
        let window = window.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let mut acc = String::new();

            loop {
                let n = match stdout.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };

                let chunk = String::from_utf8_lossy(&buf[..n]);
                acc.push_str(&chunk);

                while let Some(pos) = acc.find('\r') {
                    let line = acc[..pos].to_string();
                    acc = acc[pos + 1..].to_string();

                    window.emit("ytdlp-output", line).ok();
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let window = window.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                // yt-dlp outputs progress to stderr, so emit it as ytdlp-output
                // Check if it's a progress line (contains [download])
                if line.contains("[download]") {
                    window.emit("ytdlp-output", line.clone()).ok();
                } else {
                    // Other stderr messages go to error channel
                    window.emit("ytdlp-error", line).ok();
                }
            }
        });
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait yt-dlp: {}", e))?;

    if status.success() {
        Ok("Success".into())
    } else {
        Err(format!("yt-dlp exited with status: {}", status))
    }
}
