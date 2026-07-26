import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import webExtension from "vite-plugin-web-extension";
import pkg from "./package.json" with { type: "json" };
import fs from "fs";
import path from "path";

const manifest = {
	name: pkg.name,
	description: pkg.description,
	version: pkg.version,
	manifest_version: 3,
	icons: {
		"16": "icon/16.png",
		"32": "icon/32.png",
		"48": "icon/48.png",
		"96": "icon/96.png",
		"128": "icon/128.png",
	},
	action: {
		default_title: "POE2 Extensions",
	},
	host_permissions: ["https://www.pathofexile.com/*", "https://zetaztt.github.io/*", "https://web.poecdn.com/*"],
	permissions: ["scripting", "storage", "tabs", "sidePanel"],
	background: {
		service_worker: "projects/apps/background/src/main.ts",
	},
	side_panel: {
		default_path: "projects/apps/sidepanel/src/sidepanel.html",
	},
	content_scripts: [
		{
			matches: ["https://www.pathofexile.com/trade2*"],
			run_at: "document_start",
			js: ["projects/apps/content/src/main.ts"],
		},
	],
	web_accessible_resources: [
		{
			resources: [
				"projects/apps/inject/src/trade/item-code/trade-item-code-inject.ts",
				"projects/apps/inject/src/trade/stat-preset/trade-stat-preset-inject.ts",
				"projects/apps/inject/src/trade/stat-preset/trade-stat-preset-style.css",
			],
			matches: ["https://www.pathofexile.com/*"],
		},
	],
} satisfies chrome.runtime.ManifestV3;

export default defineConfig((env) => {
	const chromeProfileDir = path.resolve(".chrome-profile");

	if (env.command === "serve") {
		if (!fs.existsSync(chromeProfileDir)) {
			fs.mkdirSync(chromeProfileDir, { recursive: true });
		}
	}

	const accessibleResources: string[] = [];

	for (const config of manifest.web_accessible_resources) {
		accessibleResources.push(...config.resources);

		for (const [i, filepath] of config.resources.entries()) {
			const ext = path.extname(filepath);
			if (ext === ".ts") {
				config.resources[i] = filepath.slice(0, -ext.length) + ".js";
			}
		}
	}

	return {
		publicDir: "assets",
		build: {
			outDir: "dist/poe2-extensions",
			minify: env.mode === "production",
			sourcemap: env.command === "serve" ? "inline" : false,
		},
		define: {
			CHROME: "true",
		},
		plugins: [
			vue(),
			webExtension({
				manifest: () => manifest,
				webExtConfig: {
					target: "chromium",
					keepProfileChanges: true,
					chromiumProfile: chromeProfileDir,
					args: ["--disable-blink-features=AutomationControlled"],
				},
				additionalInputs: [
					"projects/apps/inject/src/trade/translate/trade-translate-inject.ts",
					...accessibleResources,
				],
				browser: "chrome",
				watchFilePaths: ["package.json", "manifest.json"],
				skipManifestValidation: true,
			}),
		],
	};
});
