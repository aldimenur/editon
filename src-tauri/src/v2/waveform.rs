use std::fs::File;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::default::{get_codecs, get_probe};

pub fn generate_waveform(path: &str, bars: usize) -> Result<Vec<f32>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let source = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());

    let probe = get_probe()
        .format(
            &Default::default(),
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| e.to_string())?;

    let mut format = probe.format;
    let track = format
        .default_track()
        .ok_or_else(|| "No default audio track found".to_string())?;

    let track_id = track.id;
    let mut decoder = get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| e.to_string())?;

    let mut peaks = Vec::<f32>::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::ResetRequired) => {
                return Err("Decoder reset required".to_string());
            }
            Err(error) => return Err(error.to_string()),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => return Err(error.to_string()),
        };

        let spec = *decoded.spec();
        let duration = decoded.capacity() as u64;
        let mut sample_buffer = SampleBuffer::<f32>::new(duration, spec);
        sample_buffer.copy_interleaved_ref(decoded);

        let channels = spec.channels.count();
        if channels == 0 {
            continue;
        }

        let samples = sample_buffer.samples();
        for frame in samples.chunks(channels) {
            let mut peak = 0.0f32;
            for sample in frame {
                let value = sample.abs();
                if value > peak {
                    peak = value;
                }
            }
            peaks.push(peak);
        }
    }

    if peaks.is_empty() {
        return Ok(vec![0.0; bars.max(1)]);
    }

    let normalized = downsample_and_normalize(&peaks, bars.max(1));
    Ok(normalized)
}

fn downsample_and_normalize(input: &[f32], bars: usize) -> Vec<f32> {
    let chunk_size = ((input.len() as f64) / (bars as f64)).ceil() as usize;
    let safe_chunk = chunk_size.max(1);

    let mut output = Vec::with_capacity(bars);
    let mut index = 0usize;
    while index < input.len() && output.len() < bars {
        let end = (index + safe_chunk).min(input.len());
        let mut max_value = 0.0f32;
        for value in &input[index..end] {
            if *value > max_value {
                max_value = *value;
            }
        }
        output.push(max_value);
        index = end;
    }

    while output.len() < bars {
        output.push(0.0);
    }

    let max = output.iter().copied().fold(0.0f32, f32::max);
    if max > 0.0 {
        for value in &mut output {
            *value /= max;
        }
    }

    output
}
