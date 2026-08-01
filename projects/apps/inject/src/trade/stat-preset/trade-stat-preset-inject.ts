import { ensureBodyReady } from "../../utils";
import { settingsIpcProtocol } from "@poe2-extensions/core/settings";
import { tradeIpcProtocol, tradeSettings } from "@poe2-extensions/core/trade";
import { ipcMain, ipcWindow } from "../../inject-ipc-channels";
import { bootstrapInjectScript } from "../../inject-script";
import { logPrefix } from "../trade-utils";
import { resetStatPresetModal } from "./trade-stat-preset-modal";
import {
	getPresetPickerFilter,
	installPresetPicker,
	removePresetPicker,
	renderPresetDropdown,
} from "./trade-stat-preset-picker";
import { installSaveButtons, removeSaveButtons } from "./trade-stat-preset-save-buttons";
import { requestPresetList } from "./trade-stat-preset-storage-client";
import { installStatPresetStyle, removeStatPresetStyle } from "./trade-stat-preset-utils";

let enabled = false;
// 初始化 RPC 与侧边栏即时通知可能并发；一旦收到通知，就不能再用较旧的初始值覆盖它。
let hasReceivedStatPresetUpdate = false;

async function initializeTradeStatPreset(): Promise<void> {
	try {
		const snapshot = await ipcMain.invoke(settingsIpcProtocol.get, {
			key: tradeSettings.statPreset.key,
			defaultValue: tradeSettings.statPreset.defaultValue,
		});
		const initialEnabled = snapshot.value as boolean;
		if (!hasReceivedStatPresetUpdate) setTradeStatPresetEnabled(initialEnabled);
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设初始状态读取失败`, error);
	}
}

/**
 * 即时切换筛选预设的全部 DOM、观察器、样式和弹窗副作用。
 */
export function setTradeStatPresetEnabled(nextEnabled: boolean): void {
	if (enabled === nextEnabled) {
		if (enabled) {
			installSaveButtons();
			installPresetPicker();
		}
		return;
	}

	enabled = nextEnabled;

	if (enabled) {
		installStatPreset();
		return;
	}

	uninstallStatPreset();
}

function installStatPreset(): void {
	ensureBodyReady(() => {
		if (!enabled) return;
		installStatPresetStyle();
		installSaveButtons();
		installPresetPicker();
		void reloadPresets();
	});
}

function uninstallStatPreset(): void {
	removeStatPresetUi();
}

async function reloadPresets(): Promise<void> {
	try {
		const presets = await requestPresetList();
		renderPresetDropdown(getPresetPickerFilter(), presets);
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设读取失败`, error);
	}
}

function removeStatPresetUi(): void {
	removeSaveButtons();
	removePresetPicker();
	resetStatPresetModal();
	removeStatPresetStyle();
}

bootstrapInjectScript(() => {
	if (window.location.hostname !== "www.pathofexile.com" || !window.location.pathname.startsWith("/trade2")) {
		return;
	}

	ipcWindow.on(tradeIpcProtocol.statPresetUpdated, ({ enabled }) => {
		hasReceivedStatPresetUpdate = true;
		setTradeStatPresetEnabled(enabled);
	});
	void initializeTradeStatPreset();
});
