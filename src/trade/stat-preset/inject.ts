import { logPrefix } from "../utils";
import type { TradeStatPreset } from "../types";
import {
	closeStatPresetModal,
	installStatPresetModal,
	openRenamePresetModal,
	openSavePresetModal,
	resetStatPresetModal,
	setStatPresetModalMessage,
} from "./modal";
import {
	focusPresetPickerDropdown,
	getPresetPickerFilter,
	hidePresetDropdown,
	installPresetPicker,
	removePresetPicker,
	renderPresetDropdown,
} from "./picker";
import { installSaveButtons, removeSaveButtons } from "./save-buttons";
import {
	handleStorageResponse,
	rejectPendingRequests,
	requestDeletePreset,
	requestPresetList,
	requestRenamePreset,
	requestSavePreset,
} from "./storage-client";
import { installStatPresetStyle, removeStatPresetStyle } from "./style";
import { cloneStatPresetQuery, ensureBodyReady, getCurrentStatGroupQuery } from "./utils";

let enabled = false;
let observer: MutationObserver | null = null;
let abortController: AbortController | null = null;
let refreshTimer: number | null = null;
let presets: TradeStatPreset[] = [];

export function setTradeStatPresetEnabled(nextEnabled: boolean): void {
	if (enabled === nextEnabled) {
		if (enabled) refreshStatPresetUi();
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
	abortController = new AbortController();
	window.addEventListener("message", handleStorageResponse, { signal: abortController.signal });
	ensureBodyReady(() => {
		if (!enabled) return;
		installStatPresetStyle();
		installStatPresetModal({
			onSave: savePreset,
			onRename: renamePreset,
			onRenameCancel: focusPresetPickerDropdown,
			signal: abortController?.signal,
		});
		ensureObserver();
		refreshStatPresetUi();
		void reloadPresets();
	}, abortController.signal);
}

function uninstallStatPreset(): void {
	abortController?.abort();
	abortController = null;
	observer?.disconnect();
	observer = null;

	if (refreshTimer !== null) {
		window.clearTimeout(refreshTimer);
		refreshTimer = null;
	}

	rejectPendingRequests(new Error("筛选预设保存已关闭"));
	removeStatPresetUi();
	presets = [];
}

function ensureObserver(): void {
	if (observer || !document.body) return;

	observer = new MutationObserver(() => {
		if (!enabled || refreshTimer !== null) return;

		refreshTimer = window.setTimeout(() => {
			refreshTimer = null;
			refreshStatPresetUi();
		}, 100);
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}

function refreshStatPresetUi(): void {
	if (!enabled || !document.body) return;

	installSaveButtons(openSavePresetModal, abortController?.signal);
	installPresetPicker({
		presets,
		onApply: applyPreset,
		onRename: openRenamePresetModal,
		onDelete: (name) => {
			void deletePreset(name);
		},
		signal: abortController?.signal,
	});
}

async function savePreset(statIndex: number, name: string): Promise<void> {
	const query = getCurrentStatGroupQuery(statIndex);
	if (!query) return;

	try {
		presets = await requestSavePreset({
			name,
			query: cloneStatPresetQuery(query),
		});
		renderPresetDropdown(getPresetPickerFilter(), presets);
		closeStatPresetModal();
	} catch (error) {
		setStatPresetModalMessage("保存失败，请稍后重试");
		console.warn(`${logPrefix} 筛选预设保存失败`, error);
	}
}

function applyPreset(preset: TradeStatPreset): void {
	try {
		window.app?.$store.commit("pushStatGroup", cloneStatPresetQuery(preset.query));
		hidePresetDropdown();
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设应用失败`, error);
	}
}

async function deletePreset(name: string): Promise<void> {
	try {
		presets = await requestDeletePreset(name);
		renderPresetDropdown(getPresetPickerFilter(), presets);
		focusPresetPickerDropdown();
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设删除失败`, error);
	}
}

async function renamePreset(oldName: string, newName: string): Promise<void> {
	if (oldName === newName) {
		closeStatPresetModal();
		return;
	}

	try {
		presets = await requestRenamePreset(oldName, newName);
		renderPresetDropdown(getPresetPickerFilter(), presets);
		closeStatPresetModal();
	} catch (error) {
		setStatPresetModalMessage(error instanceof Error ? error.message : "重命名失败，请稍后重试");
		console.warn(`${logPrefix} 筛选预设重命名失败`, error);
	}
}

async function reloadPresets(): Promise<void> {
	try {
		presets = await requestPresetList();
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
