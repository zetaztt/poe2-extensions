import browser from "webextension-polyfill";
import { ipcMain, ipcWindow } from "../ipc/ipc";
import { createContentIpcMain, createContentIpcWindow } from "../ipc/ipc-implementations";

ipcMain.register(createContentIpcMain);
ipcWindow.register(createContentIpcWindow);

export async function installTradeContent(): Promise<void> {
	await injectTradeFeatureScripts();
}

async function injectTradeFeatureScripts(): Promise<void> {
	const injectPaths = [
		"src/trade/item-code/trade-item-code-inject.js",
		"src/trade/stat-preset/trade-stat-preset-inject.js",
	];
	const injectPromises: Promise<void>[] = [];

	for (const path of injectPaths) {
		injectPromises.push(
			injectExtensionScript(path, { keepInDom: true })
				.then(() => undefined)
				.catch((error) => {
					console.error(`[poe2-extensions][trade] 主世界脚本注入失败: ${path}`, error);
				}),
		);
	}

	await Promise.all(injectPromises);
}

interface InjectExtensionScriptOptions {
	keepInDom?: boolean;
}

interface InjectExtensionScriptResult {
	script: HTMLScriptElement;
}

function injectExtensionScript(
	path: string,
	options: InjectExtensionScriptOptions = {},
): Promise<InjectExtensionScriptResult> {
	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = browser.runtime.getURL(path);
		script.async = false;
		script.defer = false;

		script.addEventListener(
			"load",
			() => {
				if (!options.keepInDom) script.remove();
				resolve({ script });
			},
			{ once: true },
		);
		script.addEventListener(
			"error",
			() => {
				if (!options.keepInDom) script.remove();
				reject(new Error(`脚本注入失败: ${path}`));
			},
			{ once: true },
		);

		(document.head || document.documentElement).append(script);
	});
}
void installTradeContent();
