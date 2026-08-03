import browser from "webextension-polyfill";
import { installContentIpcRelays } from "./content-ipc-relays";

installContentIpcRelays();

export type ContentScriptMain = () => void | Promise<void>;

export interface InjectExtensionScriptOptions {
	keepInDom?: boolean;
}

export interface InjectExtensionScriptResult {
	script: HTMLScriptElement;
}

/**
 * 在 IPC channel 注册完成后执行 content 入口，并统一消费同步异常和异步 rejection。
 */
export function bootstrapContentScript(main: ContentScriptMain): void {
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

/**
 * 将打包后的扩展脚本注入 MAIN world。
 * 默认加载后移除标签，keepInDom 仅供需保留节点的脚本使用。
 */
export function injectExtensionScript(
	filepath: string,
	options: InjectExtensionScriptOptions = {},
): Promise<InjectExtensionScriptResult> {
	return new Promise((resolve, reject) => {
		const script = document.createElement("script");

		if (filepath.endsWith(".ts")) {
			filepath = filepath.slice(0, -".ts".length) + ".js";
		}
		script.src = browser.runtime.getURL(filepath);
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
				reject(new Error(`脚本注入失败: ${filepath}`));
			},
			{ once: true },
		);

		(document.head || document.documentElement).append(script);
	});
}
