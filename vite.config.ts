import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import webExtension from "vite-plugin-web-extension";
import pkg from "./package.json" with { type: "json" };
import manifest from "./src/manifest.json" with { type: "json" };
import fs from "fs";
import path from "path";

const chromeProfileDir = path.resolve(".chrome-profile");

if (process.env.NODE_ENV !== "production") {
	if (!fs.existsSync(chromeProfileDir)) {
		fs.mkdirSync(chromeProfileDir, { recursive: true });
	}
}

export default defineConfig({
	publicDir: "assets",
	plugins: [
		vue(),
		webExtension({
			manifest: () => ({
				name: pkg.name,
				description: pkg.description,
				version: pkg.version,
				...manifest,
			}),
			webExtConfig: {
				target: "chromium",
				keepProfileChanges: true,
				chromiumProfile: chromeProfileDir,
				args: ["--disable-blink-features=AutomationControlled"],
			},
			additionalInputs: ["src/trade/trade-inject.ts"],
			browser: "chrome",
			watchFilePaths: ["package.json", "src/manifest.json"],
			skipManifestValidation: true,
		}),
	],
});
