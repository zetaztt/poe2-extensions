import browser from "webextension-polyfill";
import {
	isPoeTranslationMessage,
	poeTranslationMessageSource,
	PoeTranslationMessageType,
	type PoeTranslationFetchErrorMessage,
	type PoeTranslationMessage,
} from "./trade-translate-messages";

const backgroundResponseTimeoutMs = 15_000;

export function installTranslationDictionaryBridge(): void {
	window.addEventListener("message", async (event: MessageEvent<unknown>) => {
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
			reject(new Error("background 无响应"));
		}, backgroundResponseTimeoutMs);

		browser.runtime
			.sendMessage(message)
			.then((response: unknown) => {
				window.clearTimeout(timeoutId);

				if (!isPoeTranslationMessage(response)) {
					reject(new Error("background 无响应"));
					return;
				}

				resolve(response);
			})
			.catch((error) => {
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
