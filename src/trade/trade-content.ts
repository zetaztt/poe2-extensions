import browser from "webextension-polyfill";
import { getTradeItemCopyEnabled, getTradeStatPresetEnabled } from "../settings";
import {
	createTradeItemCopyUpdateMessage,
	createTradeStatPresetUpdateMessage,
	isPoeTradeItemCopyUpdateMessage,
	isPoeTradeStatPresetUpdateMessage,
} from "./trade-messages";
import { installStatPresetStorageBridge } from "./stat-preset/trade-stat-preset-content";
import { installTranslationDictionaryBridge } from "./translate/trade-translate-content";

let currentItemCopyEnabled = false;
let currentStatPresetEnabled = false;

export async function installTradeContent(): Promise<void> {
	installTranslationDictionaryBridge();

	[currentItemCopyEnabled, currentStatPresetEnabled] = await Promise.all([
		getTradeItemCopyEnabled(),
		getTradeStatPresetEnabled(),
	]);

	installStatPresetStorageBridge(isTradeStatPresetEnabled);
	installTradeFeaturesBridge();

	await injectTradeFeatureScripts();

	postTradeFeatureUpdates();
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

function installTradeFeaturesBridge(): void {
	browser.runtime.onMessage.addListener((message: unknown) => {
		if (isPoeTradeItemCopyUpdateMessage(message)) {
			currentItemCopyEnabled = message.enabled;
			postTradeItemCopyUpdate();
			return;
		}

		if (isPoeTradeStatPresetUpdateMessage(message)) {
			currentStatPresetEnabled = message.enabled;
			postTradeStatPresetUpdate();
		}
	});
}

function postTradeFeatureUpdates(): void {
	postTradeItemCopyUpdate();
	postTradeStatPresetUpdate();
}

function postTradeItemCopyUpdate(): void {
	window.postMessage(createTradeItemCopyUpdateMessage(currentItemCopyEnabled), window.location.origin);
}

function postTradeStatPresetUpdate(): void {
	window.postMessage(createTradeStatPresetUpdateMessage(currentStatPresetEnabled), window.location.origin);
}

function isTradeStatPresetEnabled(): boolean {
	return currentStatPresetEnabled;
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
