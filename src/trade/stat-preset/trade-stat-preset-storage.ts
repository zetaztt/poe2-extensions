import browser from "webextension-polyfill";
import { ipcMain } from "../../ipc/ipc";
import { getTradeStatPresetEnabled } from "../../settings/settings-storage";
import { tradeIpcProtocol } from "../trade-ipc-protocol";
import type { TradeStatPreset, TradeStatPresetQuery } from "../trade-types";

const tradeStatPresetStorageKey = "tradeStatPresets";

export function installTradeStatPresetHandlers(): void {
	ipcMain.handle(tradeIpcProtocol.listStatPresets, async () => {
		await ensureStatPresetEnabled();
		return getStoredTradeStatPresets();
	});
	ipcMain.handle(tradeIpcProtocol.saveStatPreset, async ({ preset }) => {
		await ensureStatPresetEnabled();
		return saveStatPreset(preset);
	});
	ipcMain.handle(tradeIpcProtocol.renameStatPreset, async ({ oldName, newName }) => {
		await ensureStatPresetEnabled();
		return renameStatPreset(oldName, newName);
	});
	ipcMain.handle(tradeIpcProtocol.deleteStatPreset, async ({ name }) => {
		await ensureStatPresetEnabled();
		return deleteStatPreset(name);
	});
}

async function saveStatPreset(preset: TradeStatPreset): Promise<TradeStatPreset[]> {
	const presets = await getStoredTradeStatPresets();
	const nextPreset = {
		name: preset.name.trim(),
		query: preset.query,
	};
	if (!nextPreset.name) throw new Error("预设名称不能为空");

	const existingIndex = presets.findIndex((candidate) => candidate.name === nextPreset.name);
	if (existingIndex >= 0) {
		presets[existingIndex] = nextPreset;
	} else {
		presets.push(nextPreset);
	}

	await setStoredTradeStatPresets(presets);
	return presets;
}

async function renameStatPreset(oldNameValue: string, newNameValue: string): Promise<TradeStatPreset[]> {
	const presets = await getStoredTradeStatPresets();
	const oldName = oldNameValue.trim();
	const newName = newNameValue.trim();
	if (!newName) throw new Error("预设名称不能为空");

	const existingIndex = presets.findIndex((preset) => preset.name === oldName);
	if (existingIndex < 0) throw new Error("未找到要重命名的预设");
	if (oldName === newName) return presets;
	if (presets.some((preset) => preset.name === newName)) throw new Error("预设名称已存在");

	presets[existingIndex] = {
		...presets[existingIndex],
		name: newName,
	};
	await setStoredTradeStatPresets(presets);
	return presets;
}

async function deleteStatPreset(name: string): Promise<TradeStatPreset[]> {
	const presets = await getStoredTradeStatPresets();
	const nextPresets = presets.filter((preset) => preset.name !== name);
	await setStoredTradeStatPresets(nextPresets);
	return nextPresets;
}

async function ensureStatPresetEnabled(): Promise<void> {
	if (!(await getTradeStatPresetEnabled())) throw new Error("筛选预设保存已关闭");
}

async function getStoredTradeStatPresets(): Promise<TradeStatPreset[]> {
	const values = await browser.storage.local.get(tradeStatPresetStorageKey);
	const presets = values[tradeStatPresetStorageKey];

	if (isTradeStatPresetArray(presets)) return presets;
	if (presets !== undefined) await browser.storage.local.remove(tradeStatPresetStorageKey);
	return [];
}

async function setStoredTradeStatPresets(presets: TradeStatPreset[]): Promise<void> {
	// IPC 内部调用允许自然报错，但持久化边界必须阻止无效数据污染后续会话。
	if (!isTradeStatPresetArray(presets)) throw new Error("筛选预设数据格式无效");

	await browser.storage.local.set({
		[tradeStatPresetStorageKey]: presets,
	});
}

function isTradeStatPresetArray(value: unknown): value is TradeStatPreset[] {
	return Array.isArray(value) && value.every(isTradeStatPreset);
}

function isTradeStatPreset(value: unknown): value is TradeStatPreset {
	if (!isRecord(value)) return false;
	return typeof value.name === "string" && isTradeStatPresetQuery(value.query);
}

function isTradeStatPresetQuery(value: unknown): value is TradeStatPresetQuery {
	return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
