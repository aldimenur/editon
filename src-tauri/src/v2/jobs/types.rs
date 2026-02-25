use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct JobRow {
    pub id: i64,
    pub job_type: String,
    pub payload: String,
    pub attempts: i64,
    pub max_attempts: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetJobPayload {
    pub asset_id: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimMediaPayload {
    pub asset_id: i64,
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeDownloadPayload {
    pub url: String,
    pub output_dir: String,
}

pub fn validate_payload(job_type: &str, payload: &str) -> Result<(), String> {
    match job_type {
        "generate_waveform" | "generate_video_thumbnail" => {
            let parsed: AssetJobPayload =
                serde_json::from_str(payload).map_err(|e| format!("Invalid payload: {}", e))?;
            if parsed.asset_id <= 0 {
                return Err("assetId must be > 0".to_string());
            }
            Ok(())
        }
        "trim_media" => {
            let parsed: TrimMediaPayload =
                serde_json::from_str(payload).map_err(|e| format!("Invalid payload: {}", e))?;
            if parsed.asset_id <= 0 {
                return Err("assetId must be > 0".to_string());
            }
            if parsed.start_sec < 0.0 || parsed.end_sec <= parsed.start_sec {
                return Err("Invalid trim range".to_string());
            }
            Ok(())
        }
        "dependencies_install" | "dependencies_update" | "prefetch_preview" => {
            let _: serde_json::Value =
                serde_json::from_str(payload).map_err(|e| format!("Invalid payload: {}", e))?;
            Ok(())
        }
        "youtube_download" => {
            let parsed: YoutubeDownloadPayload =
                serde_json::from_str(payload).map_err(|e| format!("Invalid payload: {}", e))?;
            if parsed.url.trim().is_empty() {
                return Err("url is required".to_string());
            }
            if parsed.output_dir.trim().is_empty() {
                return Err("outputDir is required".to_string());
            }
            Ok(())
        }
        _ => Err(format!("Unsupported job type: {}", job_type)),
    }
}
