import browser from "webextension-polyfill";
import { ipcMain, ipcWindow } from "@poe2-extensions/core/ipc";
import { createContentIpcMain, createContentIpcWindow } from "./ipc-adapter";

export type ContentScriptMain = () => void | Promise<void>;

export interface InjectExtensionScriptOptions {
	keepInDom?: boolean;
}

export interface InjectExtensionScriptResult {
	script: HTMLScriptElement;
}

export function bootstrapContentScript(main: ContentScriptMain): void {
	ipcMain.register(createContentIpcMain);
	ipcWindow.register(createContentIpcWindow);

	try {
		const result = main();
		if (result) {
			void result.catch((error) => {
				console.error("[poe2-extensions] content script 初始化失败", error);
			});
		}
	} catch (error) {
		console.error("[poe2-extensions] content script 初始化失败", error);
	}
}

export function injectExtensionScript(
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
