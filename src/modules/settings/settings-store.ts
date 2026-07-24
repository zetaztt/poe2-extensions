import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { settingsService } from "./settings-service";
import {
	SettingsServiceErrorCode,
	TradeSetting,
	type TradeSettings,
	type TradeSettingsSnapshot,
	type TradeSettingsUpdateResult,
} from "./settings-types";

interface SettingsStoreError {
	sequence: number;
	code: SettingsServiceErrorCode;
	error: unknown;
}

export const useSettingsStore = defineStore("settings", () => {
	const settings = ref<TradeSettings | null>(null);
	const isLoading = ref(false);
	const isSaving = ref(false);
	const lastError = shallowRef<SettingsStoreError | null>(null);

	// background service worker 重启会重置 revision，instanceId 用于隔离两个生命周期。
	let currentBackgroundInstanceId = "";
	let currentSettingsRevision = -1;
	const retiredBackgroundInstanceIds = new Set<string>();
	let loadPromise: Promise<TradeSettings> | null = null;
	let areSettingsNotificationsInstalled = false;

	function clearError(): void {
		lastError.value = null;
	}

	function setError(code: SettingsServiceErrorCode, error: unknown): void {
		const sequence = (lastError.value?.sequence ?? 0) + 1;
		lastError.value = { sequence, code, error };
	}

	function loadSettings(): Promise<TradeSettings> {
		if (settings.value) return Promise.resolve(settings.value);
		if (loadPromise) return loadPromise;

		ensureSettingsNotificationsInstalled();
		isLoading.value = true;
		loadPromise = settingsService
			.loadSettings()
			.then((snapshot) => applySettingsSnapshot(snapshot, true))
			.catch((error: unknown) => {
				setError(SettingsServiceErrorCode.LoadFailed, error);
				throw error;
			})
			.finally(() => {
				isLoading.value = false;
				loadPromise = null;
			});
		return loadPromise;
	}

	async function updateSetting(setting: TradeSetting, enabled: boolean): Promise<boolean> {
		if (isSaving.value) throw new Error("设置正在保存中");

		ensureSettingsNotificationsInstalled();
		isSaving.value = true;

		let currentSettings: TradeSettings;
		try {
			currentSettings = settings.value ?? (await loadSettings());
		} catch (error) {
			isSaving.value = false;
			throw error;
		}

		const previousSettings = { ...currentSettings };
		const optimisticSettings = applySetting(currentSettings, setting, enabled);

		settings.value = optimisticSettings;
		try {
			const result = await settingsService.updateSetting(setting, enabled);
			applySettingsSnapshot(result);
			return result.activeTradeTabUpdated;
		} catch (error) {
			// 若期间已收到 background 广播，则保留较新的权威快照，不用旧值覆盖。
			if (settings.value === optimisticSettings) settings.value = previousSettings;
			setError(SettingsServiceErrorCode.UpdateFailed, error);
			throw error;
		} finally {
			isSaving.value = false;
		}
	}

	function ensureSettingsNotificationsInstalled(): void {
		if (areSettingsNotificationsInstalled) return;
		areSettingsNotificationsInstalled = true;
		settingsService.subscribeSettings((snapshot) => {
			applySettingsSnapshot(snapshot);
		});
	}

	function applySettingsSnapshot(
		snapshot: TradeSettingsSnapshot | TradeSettingsUpdateResult,
		force = false,
	): TradeSettings {
		if (retiredBackgroundInstanceIds.has(snapshot.instanceId)) return settings.value ?? snapshot.settings;

		const isNewBackgroundInstance = snapshot.instanceId !== currentBackgroundInstanceId;
		const isNewerRevision = snapshot.revision > currentSettingsRevision;
		const isOlderRevision = snapshot.revision < currentSettingsRevision;
		if (!isNewBackgroundInstance && isOlderRevision) return settings.value ?? snapshot.settings;
		if (!force && !isNewBackgroundInstance && !isNewerRevision) return settings.value ?? snapshot.settings;

		if (force || isNewBackgroundInstance || isNewerRevision || !settings.value) {
			if (isNewBackgroundInstance && currentBackgroundInstanceId) {
				retiredBackgroundInstanceIds.add(currentBackgroundInstanceId);
			}
			currentBackgroundInstanceId = snapshot.instanceId;
			currentSettingsRevision = snapshot.revision;
			settings.value = snapshot.settings;
		}

		clearError();
		return settings.value ?? snapshot.settings;
	}

	function applySetting(current: TradeSettings, setting: TradeSetting, enabled: boolean): TradeSettings {
		if (setting === TradeSetting.Translate) return { ...current, translateEnabled: enabled };
		if (setting === TradeSetting.ItemCopy) return { ...current, itemCopyEnabled: enabled };
		return { ...current, statPresetEnabled: enabled };
	}

	return {
		settings,
		isLoading,
		isSaving,
		lastError,
		loadSettings,
		updateSetting,
	};
});

if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
