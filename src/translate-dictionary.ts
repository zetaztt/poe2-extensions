import { logPrefix } from './trade-translate/share';
import {
	isPoeTranslationMessage,
	poeTranslationMessageSource,
	PoeTranslationMessageType,
	type PoeTranslationFetchErrorMessage,
	type PoeTranslationFetchResultMessage,
} from './trade-translate/messages';

export type TranslateDictionary = Record<string, string>;

const dictionaryRequestTimeoutMs = 15_000;

let dictionaryRequestPromise: Promise<TranslateDictionary | null> | null = null;

export function preloadTranslateDictionary(): void {
	void loadTranslateDictionary();
}

export function loadTranslateDictionary(): Promise<TranslateDictionary | null> {
	dictionaryRequestPromise ??= requestTranslateDictionary();
	return dictionaryRequestPromise;
}

async function requestTranslateDictionary(): Promise<TranslateDictionary | null> {
	try {
		return await requestTranslateDictionaryFromBackground();
	} catch (error) {
		console.error(`${logPrefix} 翻译字典加载异常`, error);
		return null;
	}
}

function requestTranslateDictionaryFromBackground(): Promise<TranslateDictionary> {
	const requestId = createRequestId();

	return new Promise((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			window.removeEventListener('message', handleMessage);
			reject(new Error('background 无响应'));
		}, dictionaryRequestTimeoutMs);

		function handleMessage(event: MessageEvent<unknown>) {
			if (event.source !== window || !isPoeTranslationMessage(event.data)) return;
			if (event.data.requestId !== requestId) return;

			if (event.data.type === PoeTranslationMessageType.result) {
				cleanup();
				resolve((event.data as PoeTranslationFetchResultMessage).dictionary);
				return;
			}

			if (event.data.type === PoeTranslationMessageType.error) {
				cleanup();
				const { error } = event.data as PoeTranslationFetchErrorMessage;
				reject(new Error(error.status ? `${error.message}: ${error.status} ${error.statusText ?? ''}` : error.message));
			}
		}

		function cleanup() {
			window.clearTimeout(timeoutId);
			window.removeEventListener('message', handleMessage);
		}

		window.addEventListener('message', handleMessage);
		window.postMessage({
			source: poeTranslationMessageSource,
			type: PoeTranslationMessageType.fetch,
			requestId,
		}, window.location.origin);
	});
}

function createRequestId(): string {
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
