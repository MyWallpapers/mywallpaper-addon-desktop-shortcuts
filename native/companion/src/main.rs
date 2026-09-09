use serde::Deserialize;
use serde_json::{json, Value};
use std::io;

mod framing;
#[cfg(windows)]
mod windows;

const PROTOCOL_VERSION: u32 = 5;

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum HostFrame {
    Init { v: u32 },
    Settings { v: u32 },
    Message { v: u32, payload: Value },
    Shutdown { v: u32 },
}

fn validate_path(path: &str) -> Result<&str, String> {
    if path.trim().is_empty() || path.contains('\0') {
        return Err("Choose a non-empty file path or URL without null characters.".into());
    }
    Ok(path)
}

fn perform(payload: &Value) -> Result<Value, String> {
    #[cfg(windows)]
    match payload.get("kind").and_then(Value::as_str) {
        Some("shortcuts.open") => {
            let path = payload
                .get("path")
                .and_then(Value::as_str)
                .ok_or("A shortcut path is required.")?;
            windows::open_path(validate_path(path)?)?;
            Ok(Value::Null)
        }
        Some("shortcuts.browse") => Ok(rfd::FileDialog::new()
            .set_title("Select a shortcut target")
            .pick_file()
            .map(|path| Value::String(path.to_string_lossy().into_owned()))
            .unwrap_or(Value::Null)),
        Some("shortcuts.scan") => windows::desktop_icons(),
        _ => Err("Unknown shortcut operation.".into()),
    }
    #[cfg(not(windows))]
    {
        let _ = payload;
        Err("Desktop Shortcuts requires Windows.".into())
    }
}

fn main() -> Result<(), String> {
    if std::env::var("MYWALLPAPER_PROTOCOL").as_deref() != Ok("process-v2") {
        return Err("MYWALLPAPER_PROTOCOL must be process-v2".into());
    }
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    let mut initialized = false;
    while let Some(frame) =
        framing::read_json_record::<HostFrame>(&mut input).map_err(|error| error.to_string())?
    {
        match frame {
            HostFrame::Init { v } if v == PROTOCOL_VERSION && !initialized => {
                initialized = true;
                framing::write_json_record(
                    &mut output,
                    &json!({"type":"ready","v":PROTOCOL_VERSION}),
                )
                .map_err(|error| error.to_string())?;
            }
            HostFrame::Settings { v } if v == PROTOCOL_VERSION && initialized => {}
            HostFrame::Shutdown { v } if v == PROTOCOL_VERSION && initialized => break,
            HostFrame::Message { v, payload } if v == PROTOCOL_VERSION && initialized => {
                let id = payload
                    .get("id")
                    .and_then(Value::as_str)
                    .ok_or("The shortcut request has no identifier.")?;
                let response = match perform(&payload) {
                    Ok(value) => json!({"kind":"shortcuts.result","id":id,"value":value}),
                    Err(error) => json!({"kind":"shortcuts.result","id":id,"error":error}),
                };
                framing::write_json_record(&mut output, &json!({"type":"message","v":PROTOCOL_VERSION,"target":"broadcast","payload":response})).map_err(|error| error.to_string())?;
            }
            _ => return Err("Invalid companion protocol version or lifecycle order.".into()),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paths_preserve_spaces_unicode_and_urls_but_reject_nulls() {
        for path in [
            r"C:\Users\User\Mes documents\fichier.pdf",
            "https://example.com/a?q=b",
            "shell:Downloads",
            "文档.txt",
        ] {
            assert_eq!(validate_path(path).unwrap(), path);
        }
        for path in ["", "  ", "file\0.exe"] {
            assert!(validate_path(path).is_err());
        }
    }
}
