import { logPrefix } from "../trade-utils";
import { resetStatPresetModal } from "./trade-stat-preset-modal";
import {
	getPresetPickerFilter,
	installPresetPicker,
	removePresetPicker,
	renderPresetDropdown,
} from "./trade-stat-preset-picker";
import { installSaveButtons, removeSaveButtons } from "./trade-stat-preset-save-buttons";
import { handleStorageResponse, rejectPendingRequests, requestPresetList } from "./trade-stat-preset-storage-client";
import { installStatPresetStyle, removeStatPresetStyle } from "./trade-stat-preset-style";
import { ensureBodyReady } from "./trade-stat-preset-utils";

let enabled = false;

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
	window.addEventListener("message", handleStorageResponse);
	ensureBodyReady(() => {
		if (!enabled) return;
		installStatPresetStyle();
		installSaveButtons();
		installPresetPicker();
		void reloadPresets();
	});
}

function uninstallStatPreset(): void {
	window.removeEventListener("message", handleStorageResponse);
	rejectPendingRequests(new Error("筛选预设保存已关闭"));
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
