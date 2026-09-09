use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::ffi::c_void;
use std::path::Path;
use std::ptr::{null, null_mut};
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::System::Com::CoTaskMemFree;
use windows_sys::Win32::System::Environment::ExpandEnvironmentStringsW;
use windows_sys::Win32::UI::Shell::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

pub fn open_path(path: &str) -> Result<(), String> {
    let source = wide(path);
    unsafe {
        let size = ExpandEnvironmentStringsW(source.as_ptr(), null_mut(), 0);
        if size == 0 {
            return Err("Windows could not resolve this shortcut path.".into());
        }
        let mut expanded = vec![0u16; size as usize];
        let written = ExpandEnvironmentStringsW(source.as_ptr(), expanded.as_mut_ptr(), size);
        if written == 0 || written > size {
            return Err("Windows could not resolve this shortcut path.".into());
        }
        let result = ShellExecuteW(
            null_mut(),
            wide("open").as_ptr(),
            expanded.as_ptr(),
            null(),
            null(),
            SW_SHOWNORMAL,
        ) as isize;
        if result <= 32 {
            return Err(format!("Windows could not open this shortcut (error {result}). Check its path and installed application."));
        }
    }
    Ok(())
}

fn known_folder(id: &windows_sys::core::GUID) -> Result<std::path::PathBuf, String> {
    unsafe {
        let mut raw = null_mut();
        let result = SHGetKnownFolderPath(id, 0, null_mut(), &mut raw);
        if result < 0 {
            return Err(format!(
                "Windows could not locate the Desktop folder ({result:#x})."
            ));
        }
        let mut length = 0;
        while *raw.add(length) != 0 {
            length += 1;
        }
        let path = String::from_utf16_lossy(std::slice::from_raw_parts(raw, length));
        CoTaskMemFree(raw.cast::<c_void>());
        Ok(path.into())
    }
}

fn file_icon(path: &Path) -> Option<String> {
    unsafe {
        let mut info: SHFILEINFOW = std::mem::zeroed();
        let value = wide(&path.to_string_lossy());
        if SHGetFileInfoW(
            value.as_ptr(),
            0,
            &mut info,
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        ) == 0
            || info.hIcon.is_null()
        {
            return None;
        }
        let dc = CreateCompatibleDC(null_mut());
        if dc.is_null() {
            DestroyIcon(info.hIcon);
            return None;
        }
        let mut bitmap_info: BITMAPINFO = std::mem::zeroed();
        bitmap_info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        bitmap_info.bmiHeader.biWidth = 48;
        bitmap_info.bmiHeader.biHeight = -48;
        bitmap_info.bmiHeader.biPlanes = 1;
        bitmap_info.bmiHeader.biBitCount = 32;
        bitmap_info.bmiHeader.biCompression = BI_RGB;
        let mut bits = null_mut();
        let bitmap = CreateDIBSection(dc, &bitmap_info, DIB_RGB_COLORS, &mut bits, null_mut(), 0);
        if bitmap.is_null() || bits.is_null() {
            DeleteDC(dc);
            DestroyIcon(info.hIcon);
            return None;
        }
        let previous = SelectObject(dc, bitmap);
        std::ptr::write_bytes(bits.cast::<u8>(), 0, 48 * 48 * 4);
        let drawn = DrawIconEx(dc, 0, 0, info.hIcon, 48, 48, 0, null_mut(), DI_NORMAL);
        let mut rgba = std::slice::from_raw_parts(bits.cast::<u8>(), 48 * 48 * 4).to_vec();
        SelectObject(dc, previous);
        DeleteObject(bitmap);
        DeleteDC(dc);
        DestroyIcon(info.hIcon);
        if drawn == 0 {
            return None;
        }
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.swap(0, 2);
        }
        if rgba.chunks_exact(4).all(|pixel| pixel[3] == 0) {
            for pixel in rgba.chunks_exact_mut(4) {
                pixel[3] = 255;
            }
        }
        let mut bytes = Vec::new();
        {
            let mut encoder = png::Encoder::new(&mut bytes, 48, 48);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            let mut writer = encoder.write_header().ok()?;
            writer.write_image_data(&rgba).ok()?;
        }
        Some(STANDARD.encode(bytes))
    }
}

pub fn desktop_icons() -> Result<Value, String> {
    let mut files = Vec::new();
    for id in [&FOLDERID_Desktop, &FOLDERID_PublicDesktop] {
        let folder = known_folder(id)?;
        match std::fs::read_dir(folder) {
            Ok(entries) => {
                for entry in entries {
                    let entry = entry.map_err(|error| error.to_string())?;
                    if entry
                        .file_name()
                        .to_string_lossy()
                        .eq_ignore_ascii_case("desktop.ini")
                    {
                        continue;
                    }
                    files.push(entry.path());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    files.sort();
    files.dedup();
    Ok(Value::Array(files.into_iter().map(|path| {
        let name = if matches!(path.extension().and_then(|value| value.to_str()).map(str::to_ascii_lowercase).as_deref(), Some("lnk" | "url")) { path.file_stem() } else { path.file_name() };
        json!({"name":name.unwrap_or_default().to_string_lossy(),"exec_path":path.to_string_lossy(),"icon_base64":file_icon(&path)})
    }).collect()))
}
