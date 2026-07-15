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
	define: {
		CHROME: "true",
	},
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
			additionalInputs: [
				"src/trade/item-code/trade-item-code-inject.ts",
				"src/trade/stat-preset/trade-stat-preset-inject.ts",
				"src/trade/translate/trade-translate-inject.ts",
			],
			scriptViteConfig: {
				build: {
					sourcemap: "inline",
				},
			},
			browser: "chrome",
			watchFilePaths: ["package.json", "src/manifest.json"],
			skipManifestValidation: true,
		}),
	],
});
