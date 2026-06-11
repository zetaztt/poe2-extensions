import { type TranslateDictionary } from '@/src/translate-dictionary';
import {
	isPoeTranslationMessage,
	poeTranslationMessageSource,
	PoeTranslationMessageType,
	type PoeTranslationFetchErrorMessage,
	type PoeTranslationFetchMessage,
	type PoeTranslationFetchResultMessage,
} from '@/src/trade-translate/messages';

export const translateDictionaryUrl = 'https://zetaztt.github.io/poe2/translate.json';
export const translateDictionaryMetaUrl = 'https://zetaztt.github.io/poe2/translate-meta.json';

const translateDictionaryCacheKey = 'translateDictionaryCache';
const localTranslateDictionaryPath = '/translate.json' as Parameters<typeof browser.runtime.getURL>[0];
const localTranslateMetaPath = '/translate-meta.json' as Parameters<typeof browser.runtime.getURL>[0];

interface TranslateMeta {
	version: number;
}

interface CachedTranslateDictionary {
	version: number;
	dictionary: TranslateDictionary;
}

let localTranslateDictionaryPromise: Promise<TranslateDictionary | null> | null = null;
let localTranslateMetaPromise: Promise<TranslateMeta | null> | null = null;

export default defineBackground(() => {
	console.debug('[poe2-extensions] background loaded.', { id: browser.runtime.id });
	void enableSidePanelOnActionClick();

	browser.runtime.onMessage.addListener((message: unknown) => {
		if (!isPoeTranslationMessage(message)) return;
		if (message.type !== PoeTranslationMessageType.fetch) return;

		return fetchTranslateDictionary(message);
	});
});

type ChromeSidePanelApi = {
	setPanelBehavior?: (behavior: { openPanelOnActionClick: boolean }) => Promise<void> | void;
	open?: (options: { windowId?: number }) => Promise<void> | void;
};

type ChromeActionApi = {
	onClicked?: {
		addListener: (listener: (tab: { windowId?: number }) => void) => void;
	};
};

type ChromeApi = {
	action?: ChromeActionApi;
	sidePanel?: ChromeSidePanelApi;
};

async function enableSidePanelOnActionClick(): Promise<void> {
	const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeApi }).chrome;

	try {
		await chromeApi?.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
	} catch (error) {
		console.warn('[poe2-extensions] 侧边栏点击行为设置失败', error);
	}

	chromeApi?.action?.onClicked?.addListener((tab) => {
		void Promise.resolve(chromeApi.sidePanel?.open?.({ windowId: tab.windowId })).catch((error) => {
			console.warn('[poe2-extensions] 侧边栏打开失败', error);
		});
	});
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

	if (!current) return createFetchErrorMessage(message.requestId, '本地翻译字典格式无效');

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
		type: PoeTranslationMessageType.result,
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
		type: PoeTranslationMessageType.error,
		requestId,
		error: {
			message,
			status,
			statusText,
		},
	};
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
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
	const meta = await fetchLocalJson(localTranslateMetaPath, '本地翻译字典版本读取失败');
	return isTranslateMeta(meta) ? meta : null;
}

function loadLocalTranslateDictionary(): Promise<TranslateDictionary | null> {
	localTranslateDictionaryPromise ??= fetchLocalTranslateDictionary();
	return localTranslateDictionaryPromise;
}

async function fetchLocalTranslateDictionary(): Promise<TranslateDictionary | null> {
	const dictionary = await fetchLocalJson(localTranslateDictionaryPath, '本地翻译字典读取失败');
	return isTranslateDictionary(dictionary) ? dictionary : null;
}

async function fetchLocalJson(path: Parameters<typeof browser.runtime.getURL>[0], message: string): Promise<unknown> {
	try {
		const response = await fetch(browser.runtime.getURL(path), {
			cache: 'no-store',
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
		console.warn('[poe2-extensions] 翻译字典缓存读取失败', error);
		return null;
	}
}

async function cacheTranslateDictionary(cache: CachedTranslateDictionary): Promise<void> {
	try {
		await browser.storage.local.set({ [translateDictionaryCacheKey]: cache });
	} catch (error) {
		console.warn('[poe2-extensions] 翻译字典缓存写入失败', error);
	}
}

async function clearCachedTranslateDictionary(): Promise<void> {
	try {
		await browser.storage.local.remove(translateDictionaryCacheKey);
	} catch (error) {
		console.warn('[poe2-extensions] 翻译字典缓存清理失败', error);
	}
}

async function fetchTranslateMeta(): Promise<TranslateMeta | null> {
	const meta = await fetchJson(translateDictionaryMetaUrl);
	return isTranslateMeta(meta) ? meta : null;
}

async function fetchRemoteTranslateDictionary(): Promise<TranslateDictionary | null> {
	const dictionary = await fetchJson(translateDictionaryUrl);
	return isTranslateDictionary(dictionary) ? dictionary : null;
}

async function fetchJson(url: string): Promise<unknown> {
	try {
		const response = await fetch(url, {
			cache: 'no-store',
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				Pragma: 'no-cache',
				Expires: '0',
			},
		});

		if (!response.ok) return null;
		return await response.json();
	} catch (error) {
		console.warn('[poe2-extensions] 翻译字典远端请求失败', error);
		return null;
	}
}

function isTranslateMeta(value: unknown): value is TranslateMeta {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	return typeof (value as TranslateMeta).version === 'number';
}

function isCachedTranslateDictionary(value: unknown): value is CachedTranslateDictionary {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	const cache = value as CachedTranslateDictionary;
	return typeof cache.version === 'number' && isTranslateDictionary(cache.dictionary);
}

function isTranslateDictionary(value: unknown): value is TranslateDictionary {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	return Object.values(value).every((entry) => typeof entry === 'string');
}
