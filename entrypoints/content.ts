import { injectScript } from 'wxt/utils/inject-script';
import { getTradeItemCopyEnabled, getTradeStatPresetEnabled, getTradeTranslateEnabled } from '@/src/settings';
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
import {
	createStatPresetErrorMessage,
	createStatPresetResultMessage,
	isPoeStatPresetRequestMessage,
	isTradeStatPresetArray,
	PoeStatPresetMessageType,
	type PoeStatPresetRequestMessage,
} from '@/src/trade/stat-preset/messages';
import type { TradeStatPreset } from '@/src/trade/types';

const backgroundResponseTimeoutMs = 15_000;
const tradeStatPresetStorageKey = 'tradeStatPresets';

let currentFeatures: TradeFeatures = {
	translate: false,
	itemCopy: false,
	statPreset: false,
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
		statPreset: await getTradeStatPresetEnabled(),
	};

	installTranslationDictionaryBridge();
	installStatPresetStorageBridge();
	installTradeFeaturesBridge();

	await injectScript('/injector.js', {
		keepInDom: false,
	}).catch((error) => {
		console.error('[poe2-extensions][trade] 主世界脚本注入失败', error);
	});

	postTradeFeaturesUpdate();
}

function installStatPresetStorageBridge(): void {
	window.addEventListener('message', async (event: MessageEvent<unknown>) => {
		if (event.source !== window || !isPoeStatPresetRequestMessage(event.data)) return;
		if (!currentFeatures.statPreset) return;

		try {
			const presets = await handleStatPresetRequest(event.data);
			window.postMessage(createStatPresetResultMessage(event.data.requestId, presets), window.location.origin);
		} catch (error) {
			window.postMessage(createStatPresetErrorMessage(event.data.requestId, error), window.location.origin);
		}
	});
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

async function handleStatPresetRequest(message: PoeStatPresetRequestMessage): Promise<TradeStatPreset[]> {
	if (message.type === PoeStatPresetMessageType.list) {
		return getStoredTradeStatPresets();
	}

	if (message.type === PoeStatPresetMessageType.save) {
		const presets = await getStoredTradeStatPresets();
		const nextPreset = {
			name: message.preset.name.trim(),
			query: message.preset.query,
		};
		if (!nextPreset.name) throw new Error('预设名称不能为空');

		const existingIndex = presets.findIndex((preset) => preset.name === nextPreset.name);
		if (existingIndex >= 0) {
			presets[existingIndex] = nextPreset;
		} else {
			presets.push(nextPreset);
		}

		await setStoredTradeStatPresets(presets);
		return presets;
	}

	if (message.type === PoeStatPresetMessageType.rename) {
		const presets = await getStoredTradeStatPresets();
		const oldName = message.oldName.trim();
		const newName = message.newName.trim();
		if (!newName) throw new Error('预设名称不能为空');

		const existingIndex = presets.findIndex((preset) => preset.name === oldName);
		if (existingIndex < 0) throw new Error('未找到要重命名的预设');
		if (oldName === newName) return presets;
		if (presets.some((preset) => preset.name === newName)) {
			throw new Error('预设名称已存在');
		}

		presets[existingIndex] = {
			...presets[existingIndex],
			name: newName,
		};
		await setStoredTradeStatPresets(presets);
		return presets;
	}

	const presets = await getStoredTradeStatPresets();
	const nextPresets = presets.filter((preset) => preset.name !== message.name);
	await setStoredTradeStatPresets(nextPresets);
	return nextPresets;
}

async function getStoredTradeStatPresets(): Promise<TradeStatPreset[]> {
	const values = await browser.storage.local.get(tradeStatPresetStorageKey);
	const presets = values[tradeStatPresetStorageKey];

	if (isTradeStatPresetArray(presets)) return presets;

	if (presets !== undefined) {
		await browser.storage.local.remove(tradeStatPresetStorageKey);
	}

	return [];
}

async function setStoredTradeStatPresets(presets: TradeStatPreset[]): Promise<void> {
	await browser.storage.local.set({
		[tradeStatPresetStorageKey]: presets,
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
