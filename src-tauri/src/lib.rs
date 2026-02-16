use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Url, WebviewUrl, WindowEvent,
    webview::WebviewBuilder,
};

#[cfg(desktop)]
use tauri::menu::{Menu, Submenu};

const SHARED_CONSTANTS_JSON: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../src/shared/constants.json"
));
const URL_CHANGE_BRIDGE_SCRIPT: &str = include_str!("./url_change_bridge.js");
#[cfg(desktop)]
const CHECK_FOR_UPDATES_ICON_PNG: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../assets/check_for_updates.png"
));

/// Shared constants with Tauri backend and React frontend.
#[derive(Debug, Clone, Deserialize)]
struct SharedConstants {
    #[serde(rename = "HOME_URL")]
    home_url: String,
    #[serde(rename = "URL_CHANGED_EVENT")]
    url_changed_event: String,
    #[serde(rename = "CONTENT_WEBVIEW_LABEL")]
    content_webview_label: String,
    #[serde(rename = "TITLE_BAR_HEIGHT")]
    title_bar_height: f64,
    #[serde(rename = "SIDEBAR_WIDTH")]
    sidebar_width: f64,
    #[serde(rename = "CHECK_FOR_UPDATES_EVENT")]
    check_for_updates_event: String,
}

#[derive(Clone, Serialize)]
struct UrlChangedPayload {
    url: String,
}

/// Read shared constants from JSON file.
fn shared_constants() -> &'static SharedConstants {
    static SHARED_CONSTANTS: OnceLock<SharedConstants> = OnceLock::new();
    SHARED_CONSTANTS.get_or_init(|| {
        serde_json::from_str(SHARED_CONSTANTS_JSON)
            .expect("invalid src/shared/constants.json content")
    })
}

/// Return DeepWiki home URL.
fn home_url() -> &'static Url {
    static HOME_URL: OnceLock<Url> = OnceLock::new();
    HOME_URL.get_or_init(|| {
        Url::parse(&shared_constants().home_url).expect("invalid HOME_URL in constants.json")
    })
}

/// Check if the given URL belongs to DeepWiki.
fn is_deepwiki_url(url: &Url) -> bool {
    let home = home_url();
    url.scheme() == home.scheme()
        && url.host_str() == home.host_str()
        && url.port_or_known_default() == home.port_or_known_default()
}

/// Emit a URL changed event to Tauri Frontend.
fn emit_url_changed<R: tauri::Runtime>(app: &AppHandle<R>, url: &Url) {
    let payload = UrlChangedPayload {
        url: url.as_str().to_string(),
    };
    let _ = app.emit(shared_constants().url_changed_event.as_str(), payload);
}

/// Calculate the content webview bounds within the main window.
fn content_bounds<R: tauri::Runtime>(
    window: &tauri::Window<R>,
) -> Option<(LogicalPosition<f64>, LogicalSize<f64>)> {
    let size = window.inner_size().ok()?;
    let scale_factor = window.scale_factor().ok()?;
    let logical = size.to_logical::<f64>(scale_factor);
    let sidebar_width = shared_constants().sidebar_width.min(logical.width);
    let title_bar_height = shared_constants().title_bar_height.min(logical.height);
    let width = (logical.width - sidebar_width).max(1.0);
    let height = (logical.height - title_bar_height).max(1.0);
    Some((
        LogicalPosition::new(sidebar_width, title_bar_height),
        LogicalSize::new(width, height),
    ))
}

/// Set up the DeepWiki content webview within the main window.
#[cfg(desktop)]
fn setup_deepwiki_webview<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let home_url = home_url().clone();
    let window = app.get_window("main").ok_or(tauri::Error::WindowNotFound)?;
    let (position, size) = content_bounds(&window).ok_or(tauri::Error::WindowNotFound)?;

    window.add_child(
        WebviewBuilder::new(
            shared_constants().content_webview_label.as_str(),
            WebviewUrl::External(home_url.clone()),
        )
        .initialization_script(URL_CHANGE_BRIDGE_SCRIPT),
        position,
        size,
    )?;

    // Move to HOME by emitting URL changed event on startup
    emit_url_changed(app, &home_url);

    let app_for_resize = app.clone();
    let window_for_resize = window.clone();
    let window_for_close = window.clone();
    window.on_window_event(move |event| match event {
        // Resize and scale factor change handling
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
            let Some((position, size)) = content_bounds(&window_for_resize) else {
                return;
            };
            let Some(webview) =
                app_for_resize.get_webview(shared_constants().content_webview_label.as_str())
            else {
                return;
            };
            let _ = webview.set_position(position);
            let _ = webview.set_size(size);
        }
        // Prevent closing the main window to keep the webview alive
        WindowEvent::CloseRequested { api, .. } => {
            let _ = window_for_close.hide();
            api.prevent_close();
        }
        _ => {}
    });

    Ok(())
}

/// Navigate DeepWiki content webview to the given URL.
#[tauri::command]
fn navigate_deepwiki(app: AppHandle, url: String) -> Result<(), String> {
    let parsed = Url::parse(&url).map_err(|err| err.to_string())?;
    if !is_deepwiki_url(&parsed) {
        return Err("Only DeepWiki URLs can be navigated".into());
    }

    let webview = app
        .get_webview(shared_constants().content_webview_label.as_str())
        .ok_or_else(|| "Content webview not found".to_string())?;

    webview.navigate(parsed).map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            #[cfg(desktop)]
            {
                setup_deepwiki_webview(app.handle())?;

                if let Some(check_for_updates) = app.get_window("check_for_updates") {
                    let cloned = check_for_updates.clone();
                    check_for_updates.on_window_event(move |event| {
                        if let WindowEvent::CloseRequested { api, .. } = event {
                            let _ = cloned.hide();
                            api.prevent_close();
                        }
                    });
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![navigate_deepwiki]);

    #[cfg(desktop)]
    {
        use tauri::menu::PredefinedMenuItem;

        builder = builder
            .menu(|handle| {
                use tauri::menu::{AboutMetadata, IconMenuItem};

                let pkg_info = handle.package_info();
                let config = handle.config();
                let about_metadata = AboutMetadata {
                    name: Some(pkg_info.name.clone()),
                    version: Some(pkg_info.version.to_string()),
                    copyright: config.bundle.copyright.clone(),
                    authors: config.bundle.publisher.clone().map(|p| vec![p]),
                    ..Default::default()
                };
                let check_for_updates_icon =
                    match tauri::image::Image::from_bytes(CHECK_FOR_UPDATES_ICON_PNG) {
                        Ok(icon) => Some(icon),
                        Err(err) => {
                            eprintln!(
                                "Failed to load check_for_updates icon from assets/check_for_updates.png: {}",
                                err
                            );
                            handle.default_window_icon().cloned()
                        }
                    };
                Menu::with_items(
                    handle,
                    &[&Submenu::with_items(
                        handle,
                        pkg_info.name.clone(),
                        true,
                        &[
                            &PredefinedMenuItem::about(handle, None, Some(about_metadata))?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::hide(handle, None)?,
                            &PredefinedMenuItem::hide_others(handle, None)?,
                            &PredefinedMenuItem::separator(handle)?,
                            &IconMenuItem::with_id(
                                handle,
                                "check_for_updates",
                                "Check for updates...",
                                true,
                                check_for_updates_icon,
                                Some("CmdOrCtrl+U"),
                            )?,
                            &PredefinedMenuItem::separator(handle)?,
                            &PredefinedMenuItem::quit(handle, None)?,
                        ],
                    )?],
                )
            })
            .on_menu_event(|handle, event| {
                if event.id.as_ref() == "check_for_updates" {
                    if let Some(window) = handle.get_window("check_for_updates") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                    if let Err(err) =
                        handle.emit(shared_constants().check_for_updates_event.as_str(), ())
                    {
                        eprintln!("Failed to emit check_for_updates_event: {}", err);
                    }
                }
            });
    }

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    // macOS: Show main window when the dock icon is clicked
    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event
            && let Some(main) = app_handle.get_window("main")
        {
            let _ = main.show();
            let _ = main.set_focus();
        }
    });
}
