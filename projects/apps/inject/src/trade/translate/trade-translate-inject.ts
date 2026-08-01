import { ensureBodyReady } from "../../utils";
import { bootstrapInjectScript } from "../../inject-script";
import { logPrefix } from "../trade-utils";
import { installTranslateDataHook } from "./trade-translate-data";
import { observeItemElement } from "./trade-translate-item-element";
import { installLocalStorageHook } from "./trade-translate-storage";

/**
 * 官方繁中脚本地址；必须先于本扩展的数据和 DOM 翻译 hook 同步执行。
 */
export const traditionalChineseScriptUrl = "https://web.poecdn.com/js/translate.zh_TW.js";

/**
 * 在确认页面身份和 body 可用后安装不可卸载的翻译 hook；设置切换依赖刷新页面生效。
 */
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

/**
 * 以同步 script 顺序注入官方繁中运行时，加载失败不阻止扩展 fallback 翻译继续安装。
 */
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

bootstrapInjectScript(injectTradeTranslate);
