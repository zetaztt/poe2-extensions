import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import webExtension from "vite-plugin-web-extension";
import pkg from "./package.json" with { type: "json" };
import manifest from "./manifest.json" with { type: "json" };
import fs from "fs";
import path from "path";

export default defineConfig((env) => {
	const chromeProfileDir = path.resolve(".chrome-profile");

	if (env.command === "serve") {
		if (!fs.existsSync(chromeProfileDir)) {
			fs.mkdirSync(chromeProfileDir, { recursive: true });
		}
	}

	return {
		publicDir: "assets",
		build: {
			outDir: "dist/poe2-extensions",
			minify: env.mode === "production",
		},
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
					"projects/apps/inject/src/trade/item-code/trade-item-code-inject.ts",
					"projects/apps/inject/src/trade/stat-preset/trade-stat-preset-inject.ts",
					"projects/apps/inject/src/trade/translate/trade-translate-inject.ts",
				],
				scriptViteConfig: {
					build: {
						sourcemap: "inline",
						minify: false,
					},
				},
				browser: "chrome",
				watchFilePaths: ["package.json", "manifest.json"],
				skipManifestValidation: true,
			}),
		],
	};
});
