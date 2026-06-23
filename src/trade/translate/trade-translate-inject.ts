import { ensureBodyReady } from "../../utils";
import { logPrefix } from "../trade-utils";
import { installTranslateDataHook, isTradeDataUrl, processTradeData } from "./trade-translate-data";
import { observeItemElement } from "./trade-translate-item-element";
import { installLocalStorageHook } from "./trade-translate-storage";

export const traditionalChineseScriptUrl = "https://web.poecdn.com/js/translate.zh_TW.js";

export function injectTradeTranslate(): void {
	ensureBodyReady(function () {
		if ((document.querySelector("meta[property='og:site_name'") as HTMLMetaElement)?.content !== "Path of Exile") {
			return;
		}

		injectTraditionalChineseScript();
		installTranslateDataHook();
		observeItemElement();
		installLocalStorageHook();
	});
}

export function injectTraditionalChineseScript(): void {
	const script = document.createElement("script");
	script.src = traditionalChineseScriptUrl;
	script.async = false;

	script.addEventListener(
		"error",
		() => {
			console.error(`${logPrefix} 官方繁中脚本加载失败`);
		},
		{ once: true },
	);

	const target = document.head || document.documentElement;
	target.appendChild(script);
}

injectTradeTranslate();
