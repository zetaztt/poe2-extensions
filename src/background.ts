import browser from "webextension-polyfill";
import { getTradeTranslateEnabled, tradeTranslateEnabledKey } from "./settings";
import { type TranslateDictionary } from "./translate-dictionary";
import { isPoeTradeSyncTranslateInjectionMessage } from "./trade/trade-messages";
import {
	isPoeTranslationMessage,
	poeTranslationMessageSource,
	PoeTranslationMessageType,
	type PoeTranslationFetchErrorMessage,
	type PoeTranslationFetchMessage,
	type PoeTranslationFetchResultMessage,
} from "./trade/translate/trade-translate-messages";

export const translateDictionaryUrl = "https://zetaztt.github.io/poe2-extensions/translate.json";
export const translateDictionaryMetaUrl = "https://zetaztt.github.io/poe2-extensions/translate-meta.json";

const translateDictionaryCacheKey = "translateDictionaryCache";
const localTranslateDictionaryPath = "/translate.json" as Parameters<typeof browser.runtime.getURL>[0];
const localTranslateMetaPath = "/translate-meta.json" as Parameters<typeof browser.runtime.getURL>[0];
const tradeTranslateContentScriptId = "poe2-trade-translate-inject";
const tradeTranslateContentScriptPath = "src/trade/translate/trade-translate-inject.js";

interface TranslateMeta {
	version: number;
}

interface CachedTranslateDictionary {
	version: number;
	dictionary: TranslateDictionary;
}

let localTranslateDictionaryPromise: Promise<TranslateDictionary | null> | null = null;
let localTranslateMetaPromise: Promise<TranslateMeta | null> | null = null;
let tradeTranslateInjectionSyncPromise: Promise<void> = Promise.resolve();

console.debug("[poe2-extensions] background loaded.", { id: browser.runtime.id });
void enableSidePanelOnActionClick();
void queueTradeTranslateInjectionSync().catch((error) => {
	console.warn("[poe2-extensions] 翻译脚本注册同步失败", error);
});

browser.runtime.onMessage.addListener((message: unknown) => {
	if (isPoeTradeSyncTranslateInjectionMessage(message)) {
		return queueTradeTranslateInjectionSync();
	}

	if (!isPoeTranslationMessage(message)) return;
	if (message.type !== PoeTranslationMessageType.Fetch) return;

	return fetchTranslateDictionary(message);
});

browser.storage.onChanged.addListener((changes, areaName) => {
	if (areaName !== "sync" || !changes[tradeTranslateEnabledKey]) return;
	void queueTradeTranslateInjectionSync().catch((error) => {
		console.warn("[poe2-extensions] 翻译脚本注册同步失败", error);
	});
});

async function enableSidePanelOnActionClick(): Promise<void> {
	if (CHROME) {
		try {
			await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
		} catch (error) {
			console.warn("[poe2-extensions] 侧边栏点击行为设置失败", error);
		}

		chrome.action.onClicked.addListener((tab) => {
			void chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
				console.warn("[poe2-extensions] 侧边栏打开失败", error);
			});
		});
	}
}

function queueTradeTranslateInjectionSync(): Promise<void> {
	tradeTranslateInjectionSyncPromise = tradeTranslateInjectionSyncPromise
		.catch(() => undefined)
		.then(syncTradeTranslateInjection);
	return tradeTranslateInjectionSyncPromise;
}

async function syncTradeTranslateInjection(): Promise<void> {
	if (CHROME) {
		const enabled = await getTradeTranslateEnabled();

		try {
			await chrome.scripting.unregisterContentScripts({
				ids: [tradeTranslateContentScriptId],
			});
		} catch {
			// 未注册时注销可能失败，忽略后继续按当前开关注册。
		}

		if (!enabled) return;

		await chrome.scripting.registerContentScripts([
			{
				id: tradeTranslateContentScriptId,
				matches: ["https://www.pathofexile.com/trade2*"],
				js: [tradeTranslateContentScriptPath],
				runAt: "document_start",
				world: "MAIN",
				allFrames: false,
				persistAcrossSessions: true,
			},
		]);
	} else {
		console.warn("[poe2-extensions] 当前浏览器不支持动态注册翻译脚本");
	}
}

async function fetchTranslateDictionary(
	message: PoeTranslationFetchMessage,
): Promise<PoeTranslationFetchResultMessage | PoeTranslationFetchErrorMessage> {
	let current = await getLocalTranslateDictionary();
	const cached = await getCachedTranslateDictionary();

	if (cached) {
		if (!current || cached.version > current.version) {
			current = cached;
		} else {
			await clearCachedTranslateDictionary();
		}
	}

	if (!current) return createFetchErrorMessage(message.requestId, "本地翻译字典格式无效");

	const remoteMeta = await fetchTranslateMeta();
	if (remoteMeta && remoteMeta.version > current.version) {
		const remoteDictionary = await fetchRemoteTranslateDictionary();

		if (remoteDictionary) {
			current = {
				version: remoteMeta.version,
				dictionary: remoteDictionary,
			};
			await cacheTranslateDictionary(current);
		}
	}

	return {
		source: poeTranslationMessageSource,
		type: PoeTranslationMessageType.Result,
		requestId: message.requestId,
		dictionary: current.dictionary,
	};
}

function createFetchErrorMessage(
	requestId: string,
	message: string,
	status?: number,
	statusText?: string,
): PoeTranslationFetchErrorMessage {
	return {
		source: poeTranslationMessageSource,
		type: PoeTranslationMessageType.Error,
		requestId,
		error: {
			message,
			status,
			statusText,
		},
	};
}

async function getLocalTranslateDictionary(): Promise<CachedTranslateDictionary | null> {
	const meta = await loadLocalTranslateMeta();
	const dictionary = await loadLocalTranslateDictionary();
	if (!meta || !dictionary) return null;

	return {
		version: meta.version,
		dictionary,
	};
}

function loadLocalTranslateMeta(): Promise<TranslateMeta | null> {
	localTranslateMetaPromise ??= fetchLocalTranslateMeta();
	return localTranslateMetaPromise;
}

async function fetchLocalTranslateMeta(): Promise<TranslateMeta | null> {
	const meta = await fetchLocalJson(localTranslateMetaPath, "本地翻译字典版本读取失败");
	return isTranslateMeta(meta) ? meta : null;
}

function loadLocalTranslateDictionary(): Promise<TranslateDictionary | null> {
	localTranslateDictionaryPromise ??= fetchLocalTranslateDictionary();
	return localTranslateDictionaryPromise;
}

async function fetchLocalTranslateDictionary(): Promise<TranslateDictionary | null> {
	const dictionary = await fetchLocalJson(localTranslateDictionaryPath, "本地翻译字典读取失败");
	return isTranslateDictionary(dictionary) ? dictionary : null;
}

async function fetchLocalJson(path: Parameters<typeof browser.runtime.getURL>[0], message: string): Promise<unknown> {
	try {
		const response = await fetch(browser.runtime.getURL(path), {
			cache: "no-store",
		});

		if (!response.ok) return null;
		return await response.json();
	} catch (error) {
		console.warn(`[poe2-extensions] ${message}`, error);
		return null;
	}
}

async function getCachedTranslateDictionary(): Promise<CachedTranslateDictionary | null> {
	try {
		const values = await browser.storage.local.get(translateDictionaryCacheKey);
		const cached = values[translateDictionaryCacheKey];

		if (isCachedTranslateDictionary(cached)) return cached;

		if (cached !== undefined) await clearCachedTranslateDictionary();
		return null;
	} catch (error) {
		console.warn("[poe2-extensions] 翻译字典缓存读取失败", error);
		return null;
	}
}

async function cacheTranslateDictionary(cache: CachedTranslateDictionary): Promise<void> {
	try {
		await browser.storage.local.set({ [translateDictionaryCacheKey]: cache });
	} catch (error) {
		console.warn("[poe2-extensions] 翻译字典缓存写入失败", error);
	}
}

async function clearCachedTranslateDictionary(): Promise<void> {
	try {
		await browser.storage.local.remove(translateDictionaryCacheKey);
	} catch (error) {
		console.warn("[poe2-extensions] 翻译字典缓存清理失败", error);
	}
}

async function fetchTranslateMeta(): Promise<TranslateMeta | null> {
	try {
		const response = await fetch(translateDictionaryMetaUrl, {
			cache: "no-store",
			headers: {
				"Cache-Control": "no-cache, no-store, must-revalidate",
				Pragma: "no-cache",
				Expires: "0",
			},
		});

		if (!response.ok) return null;

		const meta: unknown = await response.json();
		return isTranslateMeta(meta) ? meta : null;
	} catch (error) {
		console.warn("[poe2-extensions] 翻译字典元数据远端请求失败", error);
		return null;
	}
}

async function fetchRemoteTranslateDictionary(): Promise<TranslateDictionary | null> {
	try {
		const response = await fetch(translateDictionaryUrl, {
			cache: "no-store",
			headers: {
				"Cache-Control": "no-cache, no-store, must-revalidate",
				Pragma: "no-cache",
				Expires: "0",
			},
		});

		if (!response.ok) return null;

		const dictionary: unknown = await response.json();
		return isTranslateDictionary(dictionary) ? dictionary : null;
	} catch (error) {
		console.warn("[poe2-extensions] 翻译字典远端请求失败", error);
		return null;
	}
}

function isTranslateMeta(value: unknown): value is TranslateMeta {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	return typeof (value as TranslateMeta).version === "number";
}

function isCachedTranslateDictionary(value: unknown): value is CachedTranslateDictionary {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

	const cache = value as CachedTranslateDictionary;
	return typeof cache.version === "number" && isTranslateDictionary(cache.dictionary);
}

function isTranslateDictionary(value: unknown): value is TranslateDictionary {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

	return Object.values(value).every((entry) => typeof entry === "string");
}
