import type { TradeStatPreset } from "../types";
import {
	createStatPresetErrorMessage,
	createStatPresetResultMessage,
	isPoeStatPresetRequestMessage,
	isTradeStatPresetArray,
	PoeStatPresetMessageType,
	type PoeStatPresetRequestMessage,
} from "./messages";

const tradeStatPresetStorageKey = "tradeStatPresets";

export function installStatPresetStorageBridge(isStatPresetEnabled: () => boolean): void {
	window.addEventListener("message", async (event: MessageEvent<unknown>) => {
		if (event.source !== window || !isPoeStatPresetRequestMessage(event.data)) return;
		if (!isStatPresetEnabled()) return;

		try {
			const presets = await handleStatPresetRequest(event.data);
			window.postMessage(createStatPresetResultMessage(event.data.requestId, presets), window.location.origin);
		} catch (error) {
			window.postMessage(createStatPresetErrorMessage(event.data.requestId, error), window.location.origin);
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
		if (!nextPreset.name) throw new Error("预设名称不能为空");

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
		if (!newName) throw new Error("预设名称不能为空");

		const existingIndex = presets.findIndex((preset) => preset.name === oldName);
		if (existingIndex < 0) throw new Error("未找到要重命名的预设");
		if (oldName === newName) return presets;
		if (presets.some((preset) => preset.name === newName)) {
			throw new Error("预设名称已存在");
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
