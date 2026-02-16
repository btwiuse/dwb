import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@/App.css";
import App from "@/App";
import { SIDEBAR_WIDTH } from "@/lib/constants";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<MantineProvider defaultColorScheme="light">
			<Notifications
				position="bottom-left"
				containerWidth={SIDEBAR_WIDTH - 24}
				zIndex={10_000}
			/>
			<App />
		</MantineProvider>
	</React.StrictMode>,
);
