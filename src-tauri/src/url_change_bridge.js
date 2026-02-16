(() => {
  if (window.location.origin !== "https://deepwiki.com") {
    return;
  }
  if (window.__DWB_URL_BRIDGE_INSTALLED__) {
    return;
  }
  window.__DWB_URL_BRIDGE_INSTALLED__ = true;

  const shouldBlockImeSubmit = (event) => {
    if (event.key !== "Enter") {
      return false;
    }
    // Safari/WebKit may report Enter during composition as keyCode 229.
    return event.isComposing || event.keyCode === 229;
  };

  const blockImeEnter = (event) => {
    if (!shouldBlockImeSubmit(event)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const notify = async () => {
    try {
      if (!window.__TAURI_INTERNALS__ || typeof window.__TAURI_INTERNALS__.invoke !== "function") {
        return;
      }
      await window.__TAURI_INTERNALS__.invoke("plugin:event|emit", {
        event: "deepwiki://url-changed",
        payload: { url: window.location.href },
      });
    } catch (_) {}
  };

  const originalPushState = history.pushState.bind(history);
  history.pushState = (...args) => {
    const result = originalPushState(...args);
    notify();
    return result;
  };

  window.addEventListener("keydown", blockImeEnter, true);
  window.addEventListener("popstate", notify);
  notify();
})();
