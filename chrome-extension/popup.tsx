import { MantineProvider } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import "./popup.css";
import { PopupApp } from "./PopupApp";

// Notify the background script that this side panel is open.
// The background uses this connection to track panel visibility per window.
const port = chrome.runtime.connect({ name: "sidepanel" });
chrome.windows.getCurrent((win) => {
	if (win?.id !== undefined) {
		port.postMessage({ type: "init", windowId: win.id });
	}
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<MantineProvider defaultColorScheme="dark">
			<PopupApp />
		</MantineProvider>
	</React.StrictMode>,
);
