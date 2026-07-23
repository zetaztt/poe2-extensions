import { ensureBodyReady } from "../../utils";
import { ipcMain, ipcWindow } from "../../ipc/ipc";
import { settingsIpcProtocol } from "../../modules/settings/settings-ipc-protocol";
import { createMainWorldIpcMain, createMainWorldIpcWindow } from "../../ipc/main-world-ipc-implementations";
import { tradeIpcProtocol } from "../trade-ipc-protocol";
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
ipcMain.register(createMainWorldIpcMain);
ipcWindow.register(createMainWorldIpcWindow);

export function injectTradeStatPreset(): void {
	if (window.location.hostname !== "www.pathofexile.com" || !window.location.pathname.startsWith("/trade2")) {
		return;
	}

	ipcWindow.on(tradeIpcProtocol.statPresetUpdated, ({ enabled }) => {
		hasReceivedStatPresetUpdate = true;
		setTradeStatPresetEnabled(enabled);
	});
	void initializeTradeStatPreset();
}

async function initializeTradeStatPreset(): Promise<void> {
	try {
		const initialEnabled = (await ipcMain.invoke(settingsIpcProtocol.load)).settings.statPresetEnabled;
		if (!hasReceivedStatPresetUpdate) setTradeStatPresetEnabled(initialEnabled);
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设初始状态读取失败`, error);
	}
}

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

injectTradeStatPreset();
