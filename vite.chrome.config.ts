import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react()],

	root: "chrome-extension",

	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},

	publicDir: "public",

	base: "",

	build: {
		outDir: resolve(__dirname, "dist-chrome"),
		emptyOutDir: true,
		rollupOptions: {
			input: {
				popup: resolve(__dirname, "chrome-extension/popup.html"),
				background: resolve(__dirname, "chrome-extension/background.ts"),
			},
			output: {
				entryFileNames: (chunkInfo) => {
					if (chunkInfo.name === "background") {
						return "background.js";
					}
					return "assets/[name]-[hash].js";
				},
				chunkFileNames: "assets/[name]-[hash].js",
				assetFileNames: "assets/[name]-[hash].[ext]",
			},
		},
	},
});
