import { MantineProvider } from "@mantine/core";
import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import "./popup.css";
import { PopupApp } from "./PopupApp";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<MantineProvider defaultColorScheme="dark">
			<PopupApp />
		</MantineProvider>
	</React.StrictMode>,
);
