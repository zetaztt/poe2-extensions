import { ensureBodyReady } from "../../utils";
import { settingsIpcProtocol, type SettingValueSnapshot } from "@poe2-extensions/core/settings";
import { tradeSettings } from "@poe2-extensions/core/trade";
import { ipcMain } from "../../inject-ipc-channels";
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
// 初始化 RPC 与通用设置通知可能并发；按 worker 实例和 revision 拒绝过期快照。
let statPresetSettingsInstanceId: string | null = null;
let statPresetSettingsRevision = -1;
const retiredStatPresetSettingsInstanceIds = new Set<string>();

async function initializeTradeStatPreset(): Promise<void> {
	try {
		const snapshot = await ipcMain.invoke(settingsIpcProtocol.get, {
			key: tradeSettings.statPreset.key,
			defaultValue: tradeSettings.statPreset.defaultValue,
		});
		applyStatPresetSettingSnapshot(snapshot);
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设初始状态读取失败`, error);
	}
}

/**
 * 应用 statPreset 的权威设置快照，并隔离 service worker 重启前后可能乱序到达的广播。
 */
function applyStatPresetSettingSnapshot(snapshot: SettingValueSnapshot): void {
	if (snapshot.key !== tradeSettings.statPreset.key) return;
	if (retiredStatPresetSettingsInstanceIds.has(snapshot.instanceId)) return;

	if (snapshot.instanceId !== statPresetSettingsInstanceId) {
		if (statPresetSettingsInstanceId) retiredStatPresetSettingsInstanceIds.add(statPresetSettingsInstanceId);
		statPresetSettingsInstanceId = snapshot.instanceId;
		statPresetSettingsRevision = -1;
	}

	if (snapshot.revision < statPresetSettingsRevision) return;
	statPresetSettingsRevision = snapshot.revision;
	setTradeStatPresetEnabled(snapshot.value as boolean);
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

	ipcMain.on(settingsIpcProtocol.onChanged, applyStatPresetSettingSnapshot);
	void initializeTradeStatPreset();
});
