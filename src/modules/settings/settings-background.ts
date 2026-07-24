import browser from "webextension-polyfill";
import { ipcMain, ipcWindow } from "../../ipc/ipc";
import { tradeIpcProtocol } from "../../trade/trade-ipc-protocol";
import { settingsIpcProtocol } from "./settings-ipc-protocol";
import {
	applyStoredTradeSetting,
	loadTradeSettings,
	setTradeSettingEnabled,
	tradeItemCopyEnabledKey,
	tradeStatPresetEnabledKey,
	tradeTranslateEnabledKey,
} from "./settings-storage";
import {
	TradeSetting,
	type TradeSettings,
	type TradeSettingsSnapshot,
	type TradeSettingsUpdateResult,
} from "./settings-types";

const tradeTranslateContentScriptId = "poe2-trade-translate-inject";
const tradeTranslateContentScriptPath = "src/trade/translate/trade-translate-inject.js";
const settingsServiceInstanceId = createId();

// background 生命周期内的权威设置快照；所有 sidepanel 只消费带 revision 的副本。
let currentSettings: TradeSettings | null = null;
let currentSettingsPromise: Promise<TradeSettings> | null = null;
// revision 同时覆盖主动写入和 storage.sync 外部变化，防止多窗口乱序覆盖。
let settingsRevision = 0;
let translateInjectionSyncPromise: Promise<void> = Promise.resolve();
let lastSyncedTranslateEnabled: boolean | null = null;

function install(): void {
	ipcMain.handle(settingsIpcProtocol.load, loadSettingsSnapshot);
	ipcMain.handle(settingsIpcProtocol.update, ({ setting, enabled }) => updateSetting(setting, enabled));
	browser.storage.onChanged.addListener(onStorageChanged);

	void getCurrentSettings()
		.then((settings) => queueTranslateInjectionSync(settings.translateEnabled))
		.catch((error) => console.warn("[poe2-extensions] 翻译脚本注册初始化失败", error));
}

async function loadSettingsSnapshot(): Promise<TradeSettingsSnapshot> {
	return createSnapshot(await getCurrentSettings());
}

async function updateSetting(setting: TradeSetting, enabled: boolean): Promise<TradeSettingsUpdateResult> {
	assertTradeSetting(setting);
	await getCurrentSettings();
	await setTradeSettingEnabled(setting, enabled);

	const nextSettings = applyStoredTradeSetting(currentSettings!, setting, enabled);
	const snapshot = applySettings(nextSettings);
	const activeTradeTabUpdated = await applySettingToActiveTradeTab(setting, enabled);
	return { ...snapshot, activeTradeTabUpdated };
}

async function getCurrentSettings(): Promise<TradeSettings> {
	if (currentSettings) return currentSettings;

	currentSettingsPromise ??= loadTradeSettings()
		.then((settings) => {
			currentSettings = settings;
			return settings;
		})
		.catch((error) => {
			currentSettingsPromise = null;
			throw error;
		});
	return currentSettingsPromise;
}

function applySettings(settings: TradeSettings): TradeSettingsSnapshot {
	if (currentSettings && areSettingsEqual(currentSettings, settings)) return createSnapshot(currentSettings);

	currentSettings = settings;
	settingsRevision += 1;
	const snapshot = createSnapshot(settings);
	void ipcMain.send(settingsIpcProtocol.changed, snapshot);
	return snapshot;
}

function createSnapshot(settings: TradeSettings): TradeSettingsSnapshot {
	return {
		instanceId: settingsServiceInstanceId,
		revision: settingsRevision,
		settings: { ...settings },
	};
}

async function onStorageChanged(changes: Record<string, { newValue?: unknown }>, areaName: string): Promise<void> {
	if (areaName !== "sync") return;
	const changedSettings = getChangedSettings(changes);
	if (changedSettings.length === 0) return;

	try {
		let settings = await getCurrentSettings();
		for (const [setting, value] of changedSettings) {
			settings = applyStoredTradeSetting(settings, setting, value);
		}
		applySettings(settings);

		const translateChange = changedSettings.find(([setting]) => setting === TradeSetting.Translate);
		if (translateChange) {
			await queueTranslateInjectionSync(settings.translateEnabled);
		}
	} catch (error) {
		console.warn("[poe2-extensions] 同步外部设置变化失败", error);
	}
}

function getChangedSettings(changes: Record<string, { newValue?: unknown }>): Array<[TradeSetting, unknown]> {
	const changedSettings: Array<[TradeSetting, unknown]> = [];
	if (changes[tradeTranslateEnabledKey]) {
		changedSettings.push([TradeSetting.Translate, changes[tradeTranslateEnabledKey].newValue]);
	}
	if (changes[tradeItemCopyEnabledKey]) {
		changedSettings.push([TradeSetting.ItemCopy, changes[tradeItemCopyEnabledKey].newValue]);
	}
	if (changes[tradeStatPresetEnabledKey]) {
		changedSettings.push([TradeSetting.StatPreset, changes[tradeStatPresetEnabledKey].newValue]);
	}
	return changedSettings;
}

async function applySettingToActiveTradeTab(setting: TradeSetting, enabled: boolean): Promise<boolean> {
	try {
		if (setting === TradeSetting.Translate) await queueTranslateInjectionSync(enabled);

		const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
		if (!tab?.id || !isTrade2Url(tab.url)) return false;

		if (setting === TradeSetting.Translate) {
			await browser.tabs.reload(tab.id);
			return true;
		}

		const notification =
			setting === TradeSetting.ItemCopy ? tradeIpcProtocol.itemCopyUpdated : tradeIpcProtocol.statPresetUpdated;
		await ipcWindow.to(tab.id).send(notification, { enabled });
		return true;
	} catch (error) {
		console.warn("[poe2-extensions] trade2 页面设置同步失败", error);
		return false;
	}
}

function queueTranslateInjectionSync(enabled: boolean): Promise<void> {
	translateInjectionSyncPromise = translateInjectionSyncPromise
		.catch(() => undefined)
		.then(async () => {
			if (lastSyncedTranslateEnabled === enabled) return;
			await syncTradeTranslateInjection(enabled);
			lastSyncedTranslateEnabled = enabled;
		});
	return translateInjectionSyncPromise;
}

async function syncTradeTranslateInjection(enabled: boolean): Promise<void> {
	if (!CHROME) {
		console.warn("[poe2-extensions] 当前浏览器不支持动态注册翻译脚本");
		return;
	}

	const registeredScripts = await chrome.scripting.getRegisteredContentScripts({
		ids: [tradeTranslateContentScriptId],
	});
	if (registeredScripts.length > 0) {
		await chrome.scripting.unregisterContentScripts({ ids: [tradeTranslateContentScriptId] });
	}

	if (!enabled) return;
	await chrome.scripting.registerContentScripts([
		{
			id: tradeTranslateContentScriptId,
			matches: ["https://www.pathofexile.com/trade2*"],
			js: [tradeTranslateContentScriptPath],
			runAt: "document_start",
			world: "MAIN",
			allFrames: false,
			persistAcrossSessions: true,
		},
	]);
}

function assertTradeSetting(setting: TradeSetting): void {
	if (
		setting !== TradeSetting.Translate
		&& setting !== TradeSetting.ItemCopy
		&& setting !== TradeSetting.StatPreset
	) {
		throw new Error("未知的 trade 设置项");
	}
}

function areSettingsEqual(left: TradeSettings, right: TradeSettings): boolean {
	return (
		left.translateEnabled === right.translateEnabled
		&& left.itemCopyEnabled === right.itemCopyEnabled
		&& left.statPresetEnabled === right.statPresetEnabled
	);
}

function isTrade2Url(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.origin === "https://www.pathofexile.com" && parsedUrl.pathname.startsWith("/trade2");
	} catch {
		return false;
	}
}

function createId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export const settingsBackground = {
	install,
};
