import browser from "webextension-polyfill";
import { TradeSetting, type TradeSettings } from "./settings-types";

export const tradeTranslateEnabledKey = "tradeTranslateEnabled";
export const defaultTradeTranslateEnabled = false;
export const tradeItemCopyEnabledKey = "tradeItemCopyEnabled";
export const defaultTradeItemCopyEnabled = false;
export const tradeStatPresetEnabledKey = "tradeStatPresetEnabled";
export const defaultTradeStatPresetEnabled = false;

export const defaultTradeSettings: TradeSettings = {
	translateEnabled: defaultTradeTranslateEnabled,
	itemCopyEnabled: defaultTradeItemCopyEnabled,
	statPresetEnabled: defaultTradeStatPresetEnabled,
};

const settingsStorage = browser.storage.sync;

export async function loadTradeSettings(): Promise<TradeSettings> {
	const values = await settingsStorage.get([
		tradeTranslateEnabledKey,
		tradeItemCopyEnabledKey,
		tradeStatPresetEnabledKey,
	]);

	return {
		translateEnabled: getBooleanOrDefault(values[tradeTranslateEnabledKey], defaultTradeTranslateEnabled),
		itemCopyEnabled: getBooleanOrDefault(values[tradeItemCopyEnabledKey], defaultTradeItemCopyEnabled),
		statPresetEnabled: getBooleanOrDefault(values[tradeStatPresetEnabledKey], defaultTradeStatPresetEnabled),
	};
}

export async function setTradeSettingEnabled(setting: TradeSetting, enabled: boolean): Promise<void> {
	await settingsStorage.set({ [getTradeSettingStorageKey(setting)]: enabled });
}

export async function getTradeTranslateEnabled(): Promise<boolean> {
	return readSettingWithFallback(TradeSetting.Translate, defaultTradeTranslateEnabled);
}

export async function getTradeItemCopyEnabled(): Promise<boolean> {
	return readSettingWithFallback(TradeSetting.ItemCopy, defaultTradeItemCopyEnabled);
}

export async function getTradeStatPresetEnabled(): Promise<boolean> {
	return readSettingWithFallback(TradeSetting.StatPreset, defaultTradeStatPresetEnabled);
}

export function setTradeTranslateEnabled(enabled: boolean): Promise<void> {
	return writeSettingWithLog(TradeSetting.Translate, enabled, "中文翻译设置写入失败");
}

export function setTradeItemCopyEnabled(enabled: boolean): Promise<void> {
	return writeSettingWithLog(TradeSetting.ItemCopy, enabled, "复制物品文本设置写入失败");
}

export function setTradeStatPresetEnabled(enabled: boolean): Promise<void> {
	return writeSettingWithLog(TradeSetting.StatPreset, enabled, "筛选预设保存设置写入失败");
}

export function getTradeSettingStorageKey(setting: TradeSetting): string {
	if (setting === TradeSetting.Translate) return tradeTranslateEnabledKey;
	if (setting === TradeSetting.ItemCopy) return tradeItemCopyEnabledKey;
	if (setting === TradeSetting.StatPreset) return tradeStatPresetEnabledKey;
	throw new Error("未知的 trade 设置项");
}

export function applyStoredTradeSetting(settings: TradeSettings, setting: TradeSetting, value: unknown): TradeSettings {
	const enabled = typeof value === "boolean" ? value : getDefaultTradeSettingValue(setting);
	if (setting === TradeSetting.Translate) return { ...settings, translateEnabled: enabled };
	if (setting === TradeSetting.ItemCopy) return { ...settings, itemCopyEnabled: enabled };
	if (setting === TradeSetting.StatPreset) return { ...settings, statPresetEnabled: enabled };
	throw new Error("未知的 trade 设置项");
}

function getDefaultTradeSettingValue(setting: TradeSetting): boolean {
	if (setting === TradeSetting.Translate) return defaultTradeTranslateEnabled;
	if (setting === TradeSetting.ItemCopy) return defaultTradeItemCopyEnabled;
	if (setting === TradeSetting.StatPreset) return defaultTradeStatPresetEnabled;
	throw new Error("未知的 trade 设置项");
}

async function readSettingWithFallback(setting: TradeSetting, fallback: boolean): Promise<boolean> {
	try {
		const key = getTradeSettingStorageKey(setting);
		const values = await settingsStorage.get(key);
		return getBooleanOrDefault(values[key], fallback);
	} catch (error) {
		console.warn(`[poe2-extensions] ${getTradeSettingReadErrorMessage(setting)}`, error);
		return fallback;
	}
}

async function writeSettingWithLog(setting: TradeSetting, enabled: boolean, message: string): Promise<void> {
	try {
		await setTradeSettingEnabled(setting, enabled);
	} catch (error) {
		console.warn(`[poe2-extensions] ${message}`, error);
		throw error;
	}
}

function getTradeSettingReadErrorMessage(setting: TradeSetting): string {
	if (setting === TradeSetting.Translate) return "中文翻译设置读取失败";
	if (setting === TradeSetting.ItemCopy) return "复制物品文本设置读取失败";
	return "筛选预设保存设置读取失败";
}

function getBooleanOrDefault(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}
