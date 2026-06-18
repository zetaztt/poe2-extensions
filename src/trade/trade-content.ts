import { injectScript } from "wxt/utils/inject-script";
import { getTradeItemCopyEnabled, getTradeStatPresetEnabled, getTradeTranslateEnabled } from "@/settings/settings";
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

	await injectScript("/injector.js", {
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
