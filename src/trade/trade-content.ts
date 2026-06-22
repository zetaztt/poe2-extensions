import browser from "webextension-polyfill";
import { getTradeItemCopyEnabled, getTradeStatPresetEnabled, getTradeTranslateEnabled } from "../settings";
import { createTradeFeaturesUpdateMessage, isPoeTradeMessage, type TradeFeatures } from "./trade-messages";
import { installStatPresetStorageBridge } from "./stat-preset/trade-stat-preset-content";
import { installTranslationDictionaryBridge } from "./translate/trade-translate-content";

let currentFeatures: TradeFeatures = {
	translate: false,
	itemCopy: false,
	statPreset: false,
};

export async function installTradeContent(): Promise<void> {
	currentFeatures = {
		translate: await getTradeTranslateEnabled(),
		itemCopy: await getTradeItemCopyEnabled(),
		statPreset: await getTradeStatPresetEnabled(),
	};

	installTranslationDictionaryBridge(isTradeTranslateEnabled);
	installStatPresetStorageBridge(isTradeStatPresetEnabled);
	installTradeFeaturesBridge();

	await injectExtensionScript("src/trade/trade-inject.js", {
		keepInDom: false,
	}).catch((error) => {
		console.error("[poe2-extensions][trade] 主世界脚本注入失败", error);
	});

	postTradeFeaturesUpdate();
}

function installTradeFeaturesBridge(): void {
	browser.runtime.onMessage.addListener((message: unknown) => {
		if (!isPoeTradeMessage(message)) return;

		currentFeatures = message.features;
		postTradeFeaturesUpdate();
	});
}

function postTradeFeaturesUpdate(): void {
	window.postMessage(createTradeFeaturesUpdateMessage(currentFeatures), window.location.origin);
}

function isTradeTranslateEnabled(): boolean {
	return currentFeatures.translate;
}

function isTradeStatPresetEnabled(): boolean {
	return currentFeatures.statPreset;
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
