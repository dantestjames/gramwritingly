// Gramwritingly desktop shell.
//
// The Rust side is deliberately thin. It owns the tray icon and the settings window, starts the
// platform helper (gw-helper on macOS) and relays its JSON lines to and from the web view, where
// the shared TypeScript engine does the actual checking.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, WindowEvent,
};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct Helper(Mutex<Option<CommandChild>>);

/// Sends one JSON line to the helper's stdin.
#[tauri::command]
fn helper_send(state: tauri::State<'_, Helper>, line: String) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    match guard.as_mut() {
        Some(child) => child
            .write(format!("{}\n", line.replace('\n', " ")).as_bytes())
            .map_err(|e| e.to_string()),
        None => Err("The text helper isn't running on this platform.".into()),
    }
}

/// Starts (or restarts) the helper and forwards everything it prints to the web view.
#[tauri::command]
fn helper_start(app: AppHandle) -> Result<(), String> {
    spawn_helper(&app)
}

fn spawn_helper(app: &AppHandle) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("The text helper is only available on macOS so far.".into());
    }
    let state = app.state::<Helper>();
    if let Some(old) = state.0.lock().map_err(|e| e.to_string())?.take() {
        let _ = old.kill();
    }
    let command = app.shell().sidecar("gw-helper").map_err(|e| e.to_string())?;
    let (mut rx, child) = command.spawn().map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(child);

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let mut pending = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    pending.push_str(&String::from_utf8_lossy(&bytes));
                    // Lines may arrive whole or in pieces; only forward complete ones.
                    while let Some(pos) = pending.find('\n') {
                        let line: String = pending.drain(..=pos).collect();
                        let line = line.trim();
                        if !line.is_empty() {
                            let _ = handle.emit("helper-message", line.to_string());
                        }
                    }
                    // The shell plugin strips newlines on some versions: a complete JSON object is a whole line.
                    if pending.starts_with('{') && serde_json::from_str::<serde_json::Value>(&pending).is_ok() {
                        let _ = handle.emit("helper-message", std::mem::take(&mut pending));
                    }
                }
                CommandEvent::Stderr(bytes) => eprintln!("{}", String::from_utf8_lossy(&bytes).trim_end()),
                CommandEvent::Terminated(status) => {
                    let _ = handle.emit(
                        "helper-message",
                        serde_json::json!({ "type": "exited", "code": status.code }).to_string(),
                    );
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

fn show_settings(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_settings(app)))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(Helper::default())
        .invoke_handler(tauri::generate_handler![helper_send, helper_start])
        .setup(|app| {
            // Menu bar app: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let open = MenuItem::with_id(app, "open", "Open Gramwritingly", true, None::<&str>)?;
            let pause = MenuItem::with_id(app, "pause", "Pause or resume checking", true, None::<&str>)?;
            let editor = MenuItem::with_id(app, "editor", "Open the web editor", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Gramwritingly", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open, &pause, &editor, &sep, &quit])?;

            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().expect("app icon"))
                .icon_as_template(false)
                .tooltip("Gramwritingly")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_settings(app),
                    "pause" => {
                        let _ = app.emit("tray-toggle", ());
                    }
                    "editor" => {
                        let _ = app.emit("tray-open-editor", ());
                    }
                    "quit" => {
                        if let Some(child) = app.state::<Helper>().0.lock().ok().and_then(|mut g| g.take()) {
                            let _ = child.kill();
                        }
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            if let Err(err) = spawn_helper(app.handle()) {
                eprintln!("gw-helper not started: {err}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the settings window hides it; the app keeps checking from the menu bar.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Gramwritingly");
}
