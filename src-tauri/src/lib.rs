use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::RECT;
#[cfg(target_os = "windows")]
use windows_sys::Win32::UI::WindowsAndMessaging::{SystemParametersInfoW, SPI_GETWORKAREA};

const PANEL_WIDTH: u32 = 420;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub completed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TodoItem {
    pub id: String,
    pub title: String,
    pub notes: Option<String>,
    pub completed: bool,
    pub priority: String, // "low", "medium", "high"
    pub category: String, // "Work", "Personal", "Ideas", "Daily", etc.
    pub due_date: Option<String>,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub subtasks: Vec<Subtask>,
}

fn default_lang() -> String {
    "fa".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    pub sound_enabled: bool,
    pub always_on_top: bool,
    pub close_on_blur: bool,
    pub shortcut: String,
    pub theme: String,
    #[serde(default = "default_lang")]
    pub lang: String,
    #[serde(default)]
    pub launch_at_startup: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            always_on_top: true,
            close_on_blur: false,
            shortcut: "CommandOrControl+Shift+Space".to_string(),
            theme: "theme-apple-frost".to_string(),
            lang: "fa".to_string(),
            launch_at_startup: false,
        }
    }
}

pub struct AppState {
    pub settings: Mutex<AppSettings>,
}

#[cfg(target_os = "windows")]
fn set_windows_autostart(enable: bool) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let app_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let path_str = format!("\"{}\"", app_path.to_string_lossy());

    if enable {
        let _ = Command::new("reg")
            .args(&[
                "add",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "Gleam",
                "/t",
                "REG_SZ",
                "/d",
                &path_str,
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    } else {
        let _ = Command::new("reg")
            .args(&[
                "delete",
                "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
                "/v",
                "Gleam",
                "/f",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_windows_autostart(_enable: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "windows")]
fn check_windows_autostart() -> bool {
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    if let Ok(output) = Command::new("reg")
        .args(&[
            "query",
            "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
            "/v",
            "Gleam",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        return output.status.success();
    }
    false
}

#[cfg(not(target_os = "windows"))]
fn check_windows_autostart() -> bool {
    false
}

fn get_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let dir = base.join("Gleam");
    let old_dir = base.join("GlassToDo");
    if !dir.exists() {
        if old_dir.exists() {
            let _ = fs::rename(&old_dir, &dir);
        } else {
            let _ = fs::create_dir_all(&dir);
        }
    }
    Ok(dir)
}

fn get_todos_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(get_data_dir(app)?.join("todos.json"))
}

fn get_settings_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(get_data_dir(app)?.join("settings.json"))
}

#[tauri::command]
fn get_todos(app: AppHandle) -> Result<Vec<TodoItem>, String> {
    let path = get_todos_file_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let todos: Vec<TodoItem> = serde_json::from_str(&data).unwrap_or_default();
    Ok(todos)
}

#[tauri::command]
fn save_todos(app: AppHandle, todos: Vec<TodoItem>) -> Result<(), String> {
    let path = get_todos_file_path(&app)?;
    let data = serde_json::to_string_pretty(&todos).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Result<AppSettings, String> {
    let path = get_settings_file_path(&app)?;
    let mut settings: AppSettings = if !path.exists() {
        AppSettings::default()
    } else {
        let data = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).unwrap_or_default()
    };
    settings.launch_at_startup = check_windows_autostart();
    Ok(settings)
}

#[tauri::command]
fn save_settings(app: AppHandle, state: tauri::State<AppState>, mut settings: AppSettings) -> Result<(), String> {
    let _ = set_windows_autostart(settings.launch_at_startup);
    settings.launch_at_startup = check_windows_autostart();

    let path = get_settings_file_path(&app)?;
    let data = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())?;
    if let Ok(mut s) = state.settings.lock() {
        *s = settings.clone();
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_always_on_top(settings.always_on_top);
    }
    let _ = update_tray_menu(app.clone(), settings.lang.clone());
    Ok(())
}

#[tauri::command]
fn set_autostart(enable: bool) -> Result<bool, String> {
    let _ = set_windows_autostart(enable);
    Ok(check_windows_autostart())
}

/// Computes the exact work area on Windows (excluding the Windows taskbar)
/// or falls back to monitor info.
fn get_screen_work_area(win: &WebviewWindow) -> (i32, i32, u32, u32) {
    #[cfg(target_os = "windows")]
    unsafe {
        let mut rect: RECT = std::mem::zeroed();
        if SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut rect as *mut _ as *mut _, 0) != 0 {
            let w = (rect.right - rect.left).max(100) as u32;
            let h = (rect.bottom - rect.top).max(100) as u32;
            return (rect.left, rect.top, w, h);
        }
    }

    if let Ok(Some(mon)) = win.current_monitor() {
        let pos = mon.position();
        let size = mon.size();
        return (pos.x, pos.y, size.width, size.height);
    }

    (0, 0, 1920, 1080)
}

/// Docks the window flush to the right edge and stretches vertically
/// from the top of the screen all the way down to the taskbar.
pub fn dock_window_right(win: &WebviewWindow) -> Result<(), String> {
    let (work_x, work_y, work_w, work_h) = get_screen_work_area(win);
    let scale_factor = win.scale_factor().unwrap_or(1.0);
    
    // Convert PANEL_WIDTH logical pixels to physical
    let physical_width = (PANEL_WIDTH as f64 * scale_factor).round() as u32;
    let target_x = work_x + (work_w as i32) - (physical_width as i32);
    let target_y = work_y;
    let target_height = work_h;

    win.set_size(PhysicalSize::new(physical_width, target_height))
        .map_err(|e| e.to_string())?;
    win.set_position(PhysicalPosition::new(target_x, target_y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn show_drawer(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = dock_window_right(&win);
        let _ = win.show();
        let _ = win.set_focus();
        let _ = app.emit("drawer-opened", ());
    }
    Ok(())
}

#[tauri::command]
fn hide_drawer(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
        let _ = app.emit("drawer-closed", ());
    }
    Ok(())
}

#[tauri::command]
fn toggle_drawer(app: AppHandle) -> Result<bool, String> {
    if let Some(win) = app.get_webview_window("main") {
        let is_visible = win.is_visible().unwrap_or(false);
        if is_visible {
            let _ = app.emit("request-close-drawer", ());
            return Ok(false);
        } else {
            let _ = dock_window_right(&win);
            let _ = win.show();
            let _ = win.set_focus();
            let _ = app.emit("drawer-opened", ());
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
fn update_tray_menu(app: AppHandle, lang: String) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("main_tray") {
        let is_fa = lang == "fa";
        let toggle_text = if is_fa { "نمایش / بستن لیست کارها (Ctrl+Shift+Space)" } else { "Open / Close To-Do (Ctrl+Shift+Space)" };
        let new_task_text = if is_fa { "افزودن سریع کار..." } else { "Quick Add Task..." };
        let quit_text = if is_fa { "خروج از برنامه" } else { "Exit Gleam" };
        let tooltip_text = if is_fa { "گلیم - برنامه‌ریز شیشه‌ای کارها" } else { "Gleam - Task Drawer" };

        if let Ok(toggle_i) = MenuItem::with_id(&app, "toggle", toggle_text, true, None::<&str>) {
            if let Ok(new_task_i) = MenuItem::with_id(&app, "new_task", new_task_text, true, None::<&str>) {
                if let Ok(quit_i) = MenuItem::with_id(&app, "quit", quit_text, true, None::<&str>) {
                    if let Ok(menu) = Menu::with_items(&app, &[&toggle_i, &new_task_i, &quit_i]) {
                        let _ = tray.set_menu(Some(menu));
                        let _ = tray.set_tooltip(Some(tooltip_text));
                    }
                }
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            settings: Mutex::new(AppSettings::default()),
        })
        .invoke_handler(tauri::generate_handler![
            get_todos,
            save_todos,
            get_settings,
            save_settings,
            set_autostart,
            show_drawer,
            hide_drawer,
            toggle_drawer,
            update_tray_menu
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Setup System Tray
            let toggle_i = MenuItem::with_id(app, "toggle", "Open / Close To-Do (Ctrl+Shift+Space)", true, None::<&str>)?;
            let new_task_i = MenuItem::with_id(app, "new_task", "Quick Add Task...", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Exit Gleam", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_i, &new_task_i, &quit_i])?;

            let tray = TrayIconBuilder::with_id("main_tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Gleam - Task Drawer")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "toggle" => {
                            let _ = toggle_drawer(app.clone());
                        }
                        "new_task" => {
                            let _ = show_drawer(app.clone());
                            let _ = app.emit("focus-add-input", ());
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let _ = toggle_drawer(app.clone());
                    }
                })
                .build(app)?;

            let _ = tray;

            // Setup Global Shortcut (Ctrl+Shift+Space)
            let shortcut_handle = handle.clone();
            let _ = app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |app, _shortcut, event| {
                        if event.state() == ShortcutState::Pressed {
                            let _ = toggle_drawer(app.clone());
                        }
                    })
                    .build(),
            );

            let shortcut_str = "CommandOrControl+Shift+Space";
            if let Ok(sc) = shortcut_str.parse::<Shortcut>() {
                let _ = shortcut_handle.global_shortcut().register(sc);
            }

            // Window customization: Acrylic / Mica and positioning
            if let Some(win) = app.get_webview_window("main") {
                #[cfg(target_os = "windows")]
                {
                    // Apply glass / acrylic blur effect on Windows with subtle tint so wallpaper blurs through
                    if let Err(e) = window_vibrancy::apply_acrylic(&win, Some((18, 26, 44, 75))) {
                        eprintln!("apply_acrylic error: {e}");
                        if let Err(e2) = window_vibrancy::apply_mica(&win, Some(true)) {
                            eprintln!("apply_mica error: {e2}");
                            let _ = window_vibrancy::apply_blur(&win, Some((18, 26, 44, 75)));
                        }
                    }
                }
                #[cfg(target_os = "macos")]
                {
                    let _ = window_vibrancy::apply_vibrancy(&win, window_vibrancy::NSVisualEffectMaterial::HudWindow, None, None);
                }

                // Initial dock position
                let _ = dock_window_right(&win);

                // Setup close-on-blur listener
                let app_handle_for_focus = handle.clone();
                win.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let state = app_handle_for_focus.state::<AppState>();
                        let close_on_blur = state.settings.lock().map(|s| s.close_on_blur).unwrap_or(false);
                        if close_on_blur {
                            let _ = app_handle_for_focus.emit("request-close-drawer", ());
                        }
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
