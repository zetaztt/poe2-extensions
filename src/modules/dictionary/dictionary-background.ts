import browser from "webextension-polyfill";
import { ipcMain } from "../../ipc/ipc";
import { dictionaryIpcProtocol } from "./dictionary-ipc-protocol";
import type { TranslateDictionary } from "./dictionary-types";

const translateDictionaryUrl = "https://zetaztt.github.io/poe2-extensions/translate.json";
const translateDictionaryMetaUrl = "https://zetaztt.github.io/poe2-extensions/translate-meta.json";

const translateDictionaryCacheKey = "translateDictionaryCache";
const localTranslateDictionaryPath = "/translate.json" as Parameters<typeof browser.runtime.getURL>[0];
const localTranslateMetaPath = "/translate-meta.json" as Parameters<typeof browser.runtime.getURL>[0];

interface TranslateMeta {
	version: number;
}

interface CachedTranslateDictionary {
	version: number;
	dictionary: TranslateDictionary;
}

let localTranslateDictionaryPromise: Promise<TranslateDictionary | null> | null = null;
let localTranslateMetaPromise: Promise<TranslateMeta | null> | null = null;

function install(): void {
	ipcMain.handle(dictionaryIpcProtocol.load, fetchTranslateDictionary);
}

async function fetchTranslateDictionary(): Promise<TranslateDictionary> {
	let current = await getLocalTranslateDictionary();
	const cached = await getCachedTranslateDictionary();

	if (cached) {
		if (!current || cached.version > current.version) current = cached;
		else await clearCachedTranslateDictionary();
	}

	if (!current) throw new Error("本地翻译字典格式无效");

	const remoteMeta = await fetchTranslateMeta();
	if (remoteMeta && remoteMeta.version > current.version) {
		const remoteDictionary = await fetchRemoteTranslateDictionary();
		if (remoteDictionary) {
			current = { version: remoteMeta.version, dictionary: remoteDictionary };
			await cacheTranslateDictionary(current);
		}
	}

	return current.dictionary;
}

async function getLocalTranslateDictionary(): Promise<CachedTranslateDictionary | null> {
	const meta = await loadLocalTranslateMeta();
	const dictionary = await loadLocalTranslateDictionary();
	return meta && dictionary ? { version: meta.version, dictionary } : null;
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
		const response = await fetch(browser.runtime.getURL(path), { cache: "no-store" });
		return response.ok ? await response.json() : null;
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
		const response = await fetch(translateDictionaryMetaUrl, { cache: "no-store", headers: getNoCacheHeaders() });
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
		const response = await fetch(translateDictionaryUrl, { cache: "no-store", headers: getNoCacheHeaders() });
		if (!response.ok) return null;
		const dictionary: unknown = await response.json();
		return isTranslateDictionary(dictionary) ? dictionary : null;
	} catch (error) {
		console.warn("[poe2-extensions] 翻译字典远端请求失败", error);
		return null;
	}
}

function getNoCacheHeaders(): Record<string, string> {
	return {
		"Cache-Control": "no-cache, no-store, must-revalidate",
		Pragma: "no-cache",
		Expires: "0",
	};
}

function isTranslateMeta(value: unknown): value is TranslateMeta {
	return isRecord(value) && typeof value.version === "number";
}

function isCachedTranslateDictionary(value: unknown): value is CachedTranslateDictionary {
	return isRecord(value) && typeof value.version === "number" && isTranslateDictionary(value.dictionary);
}

function isTranslateDictionary(value: unknown): value is TranslateDictionary {
	return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const dictionaryBackground = {
	install,
};
