import { injectScript } from 'wxt/utils/inject-script';
import { getTradeItemCopyEnabled, getTradeTranslateEnabled } from '@/src/settings';
import {
	createTradeFeaturesUpdateMessage,
	isPoeTradeMessage,
	type TradeFeatures,
} from '@/src/trade/messages';
import {
	isPoeTranslationMessage,
	poeTranslationMessageSource,
	PoeTranslationMessageType,
	type PoeTranslationFetchErrorMessage,
	type PoeTranslationMessage,
} from '@/src/trade/translate/messages';

const backgroundResponseTimeoutMs = 15_000;

let currentFeatures: TradeFeatures = {
	translate: false,
	itemCopy: false,
};

export default defineContentScript({
	matches: ['https://www.pathofexile.com/trade2*'],
	runAt: 'document_start',
	main() {
		void installTrade();
	},
});

async function installTrade(): Promise<void> {
	currentFeatures = {
		translate: await getTradeTranslateEnabled(),
		itemCopy: await getTradeItemCopyEnabled(),
	};

	installTranslationDictionaryBridge();
	installTradeFeaturesBridge();

	await injectScript('/injector.js', {
		keepInDom: false,
	}).catch((error) => {
		console.error('[poe2-extensions][trade] 主世界脚本注入失败', error);
	});

	postTradeFeaturesUpdate();
}

function installTranslationDictionaryBridge(): void {
	window.addEventListener('message', async (event: MessageEvent<unknown>) => {
		if (event.source !== window || !isPoeTranslationMessage(event.data)) return;
		if (event.data.type !== PoeTranslationMessageType.fetch) return;
		if (!currentFeatures.translate) return;

		try {
			const response = await sendRuntimeMessageWithTimeout(event.data);
			window.postMessage(response, window.location.origin);
		} catch (error) {
			window.postMessage(createFetchErrorMessage(event.data.requestId, error), window.location.origin);
		}
	});
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
