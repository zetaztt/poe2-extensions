import { translateDictionaryUrl, type TranslateDictionary } from '@/src/translate-dictionary';
import {
	isPoeTranslationMessage,
	poeTranslationMessageSource,
	PoeTranslationMessageType,
	type PoeTranslationFetchErrorMessage,
	type PoeTranslationFetchMessage,
	type PoeTranslationFetchResultMessage,
} from '@/src/trade-translate/messages';

export default defineBackground(() => {
	console.debug('[poe2-extensions] background loaded.', { id: browser.runtime.id });

	browser.runtime.onMessage.addListener((message: unknown) => {
		if (!isPoeTranslationMessage(message)) return;
		if (message.type !== PoeTranslationMessageType.fetch) return;

		return fetchTranslateDictionary(message);
	});
});

async function fetchTranslateDictionary(
	message: PoeTranslationFetchMessage,
): Promise<PoeTranslationFetchResultMessage | PoeTranslationFetchErrorMessage> {
	try {
		const response = await fetch(translateDictionaryUrl, {
			cache: 'no-store',
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate',
				Pragma: 'no-cache',
				Expires: '0',
			},
		});

		if (!response.ok) {
			return createFetchErrorMessage(message.requestId, '翻译字典请求失败', response.status, response.statusText);
		}

		let dictionary: unknown;
		try {
			dictionary = await response.json();
		} catch (error) {
			return createFetchErrorMessage(message.requestId, getErrorMessage(error, '翻译字典 JSON 解析失败'));
		}

		if (!isTranslateDictionary(dictionary)) {
			return createFetchErrorMessage(message.requestId, '翻译字典 JSON 格式无效');
		}

		return {
			source: poeTranslationMessageSource,
			type: PoeTranslationMessageType.result,
			requestId: message.requestId,
			dictionary,
		};
	} catch (error) {
		return createFetchErrorMessage(message.requestId, getErrorMessage(error, '翻译字典网络请求异常'));
	}
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

function isTranslateDictionary(value: unknown): value is TranslateDictionary {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	return Object.values(value).every((entry) => typeof entry === 'string');
}
