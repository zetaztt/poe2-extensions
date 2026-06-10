import { injectScript } from 'wxt/utils/inject-script';
import {
	isPoeTranslationMessage,
	poeTranslationMessageSource,
	PoeTranslationMessageType,
	type PoeTranslationFetchErrorMessage,
	type PoeTranslationMessage,
} from '@/src/trade-translate/messages';

const backgroundResponseTimeoutMs = 15_000;

export default defineContentScript({
	matches: ['https://www.pathofexile.com/trade2*'],
	runAt: 'document_start',
	main() {
		installTranslationDictionaryBridge();

		void injectScript('/injector.js', {
			keepInDom: false,
		}).catch((error) => {
			console.error('[poe2-extensions][translate] 主世界脚本注入失败', error);
		});
	},
});

function installTranslationDictionaryBridge(): void {
	window.addEventListener('message', async (event: MessageEvent<unknown>) => {
		if (event.source !== window || !isPoeTranslationMessage(event.data)) return;
		if (event.data.type !== PoeTranslationMessageType.fetch) return;

		try {
			const response = await sendRuntimeMessageWithTimeout(event.data);
			window.postMessage(response, window.location.origin);
		} catch (error) {
			window.postMessage(createFetchErrorMessage(event.data.requestId, error), window.location.origin);
		}
	});
}

function sendRuntimeMessageWithTimeout(message: PoeTranslationMessage): Promise<PoeTranslationMessage> {
	return new Promise((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			reject(new Error('background 无响应'));
		}, backgroundResponseTimeoutMs);

		browser.runtime.sendMessage(message).then((response: PoeTranslationMessage | undefined) => {
			window.clearTimeout(timeoutId);

			if (!response) {
				reject(new Error('background 无响应'));
				return;
			}

			resolve(response);
		}).catch((error) => {
			window.clearTimeout(timeoutId);
			reject(error);
		});
	});
}

function createFetchErrorMessage(requestId: string, error: unknown): PoeTranslationFetchErrorMessage {
	return {
		source: poeTranslationMessageSource,
		type: PoeTranslationMessageType.error,
		requestId,
		error: {
			message: error instanceof Error ? error.message : String(error),
		},
	};
}
