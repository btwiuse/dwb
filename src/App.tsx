import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { CheckForUpdates } from "@/components/CheckForUpdates";
import { Dashboard } from "@/Dashboard";

type WindowLabel = "main" | "check_for_updates";

function App() {
	// State to hold the label of the current window
	const [windowLabel, setWindowLabel] = useState<WindowLabel>("main");

	// Get the window label on app startup
	useEffect(() => {
		async function getWindowLabel() {
			const currentWindow = getCurrentWindow();
			const label = currentWindow.label;
			if (label === "main" || label === "check_for_updates") {
				setWindowLabel(label);
			}
		}
		getWindowLabel();
	}, []);

	return windowLabel === "main" ? (
		<Dashboard />
	) : windowLabel === "check_for_updates" ? (
		<CheckForUpdates />
	) : null;
}

export default App;
