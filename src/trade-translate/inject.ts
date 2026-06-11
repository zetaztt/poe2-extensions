import { logPrefix } from "./utils";
import { installTranslateDataHook, isTradeDataUrl, processTradeData } from "./translate-data";
import { observeItemElement } from "./item-element";

export const traditionalChineseScriptUrl = 'https://web.poecdn.com/js/translate.zh_TW.js';

const scriptSelector = `script[src="${traditionalChineseScriptUrl}"]`;

export function injextTrade() {
	if ((document.querySelector('meta[property="og:site_name"') as HTMLMetaElement)?.content !== "Path of Exile") {
		return;
	}

	injectTraditionalChineseScript();
	installTranslateDataHook();
	observeItemElement()

	// installPoePluginsHook();
}

export function injectTraditionalChineseScript(): void {
	if (document.querySelector(scriptSelector)) return;

	const script = document.createElement('script');
	script.src = traditionalChineseScriptUrl;
	script.async = false;

	script.addEventListener('error', () => {
		console.error(`${logPrefix} 官方繁中脚本加载失败`);
	}, { once: true });

	const target = document.head || document.documentElement;
	target.appendChild(script);
}


// function installPoePluginsHook() {
// 	let poePlugins: PoePlugins
// 	Object.defineProperty(window, "poePlugins", {
// 		get: () => poePlugins!,
// 		set: (value: PoePlugins) => {
// 			poePlugins = value;
// 			const getPlugin = poePlugins.getPlugin.bind(poePlugins);
// 			poePlugins.getPlugin = (name: string, value: unknown) => {
// 				const plugin: any = getPlugin(name, value)

// 				if (!plugin.__installed) {
// 					plugin.__installed = true;
// 					if (name === "api-plugins") {
// 						installApiPluginHook(plugin)
// 					}
// 				}



// 				return plugin;
// 			}
// 		}
// 	})
// }

// function installApiPluginHook(plugin: ApiPlugins) {
// 	plugin.hook({
// 		on: 'response',
// 		hook(response) {
// 		},
// 	});
// }