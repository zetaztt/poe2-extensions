import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import {
	type SettingMemberValue,
	type SettingPersistenceError,
	type SettingValueSnapshot,
} from "@poe2-extensions/core/settings";
import {
	SettingsServiceErrorCode,
	tradeSettings,
	type TradeSetting,
	type TradeSettingKey,
	type TradeSettings,
} from "@poe2-extensions/core/trade";
import { settingsService } from "./side-panel-settings-service";

interface SettingsStoreError {
	sequence: number;
	code: SettingsServiceErrorCode;
	error: unknown;
}

/**
 * 聚合 background 权威设置快照的页面 store。
 * 按 key/instance/revision 排序通知，并负责乐观更新和失败恢复。
 */
export const useSettingsStore = defineStore("settings", () => {
	const settings = ref<TradeSettings | null>(null);
	const isLoading = ref(false);
	const isSaving = ref(false);
	const lastError = shallowRef<SettingsStoreError | null>(null);

	// background service worker 重启会重置 revision，instanceId 用于隔离两个生命周期。
	let currentBackgroundInstanceId = "";
	// 批量响应和单项通知会独立到达，revision 必须按 key 比较，不能用一个全局游标互相淘汰。
	const settingRevisions = new Map<TradeSettingKey, number>();
	const retiredBackgroundInstanceIds = new Set<string>();
	let loadPromise: Promise<TradeSettings> | null = null;
	// 通知可能先创建部分 settings 对象；只有批量读取完成后才能把聚合状态视为已加载。
	let areSettingsLoaded = false;
	let areSettingsNotificationsInstalled = false;

	function clearError(): void {
		lastError.value = null;
	}

	function setError(code: SettingsServiceErrorCode, error: unknown): void {
		const sequence = (lastError.value?.sequence ?? 0) + 1;
		lastError.value = { sequence, code, error };
	}

	function loadSettings(): Promise<TradeSettings> {
		if (loadPromise) return loadPromise;
		if (areSettingsLoaded && settings.value) return Promise.resolve(settings.value);

		ensureSettingsNotificationsInstalled();
		isLoading.value = true;
		loadPromise = settingsService
			.getValues([tradeSettings.translate, tradeSettings.itemCopy, tradeSettings.statPreset] as const)
			.then((snapshots) => {
				for (const snapshot of snapshots) applySettingSnapshot(snapshot);
				areSettingsLoaded = true;
				return settings.value ?? tradeSettings.createDefaults();
			})
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

	async function updateSetting<TKey extends keyof TradeSettings>(
		settingKey: TKey,
		value: TradeSettings[TKey],
		update: (value: TradeSettings[TKey]) => Promise<boolean>,
	): Promise<boolean> {
		if (isSaving.value) throw new Error("设置正在保存中");

		ensureSettingsNotificationsInstalled();
		isSaving.value = true;

		let currentSettings: TradeSettings;
		try {
			currentSettings = areSettingsLoaded && settings.value ? settings.value : await loadSettings();
		} catch (error) {
			isSaving.value = false;
			throw error;
		}

		const previousSettings = { ...currentSettings };
		const optimisticSettings = { ...currentSettings, [settingKey]: value };

		settings.value = optimisticSettings;
		try {
			return await update(value);
		} catch (error) {
			// 若期间已收到 background 广播，则保留较新的权威快照，不用旧值覆盖。
			if (settings.value === optimisticSettings) settings.value = previousSettings;
			setError(SettingsServiceErrorCode.UpdateFailed, error);
			throw error;
		} finally {
			isSaving.value = false;
		}
	}

	function setSetting<TMember extends TradeSetting>(
		member: TMember,
		value: SettingMemberValue<TMember>,
	): Promise<boolean> {
		// member key 在运行时重新关联聚合字段和具名 trade RPC；分支内断言恢复联合类型擦除的值类型。
		switch (member.key) {
			case tradeSettings.translate.key:
				return updateSetting(
					"translate",
					value as TradeSettings["translate"],
					settingsService.setTranslateEnabled,
				);
			case tradeSettings.itemCopy.key:
				return updateSetting(
					"itemCopy",
					value as TradeSettings["itemCopy"],
					settingsService.setItemCopyEnabled,
				);
			case tradeSettings.statPreset.key:
				return updateSetting(
					"statPreset",
					value as TradeSettings["statPreset"],
					settingsService.setStatPresetEnabled,
				);
			default:
				throw new Error("未知的 trade 设置项");
		}
	}

	function ensureSettingsNotificationsInstalled(): void {
		if (areSettingsNotificationsInstalled) return;
		areSettingsNotificationsInstalled = true;
		settingsService.subscribeSettings((snapshot) => applySettingSnapshot(snapshot), onSettingPersistenceFailed);
	}

	function applySettingSnapshot(snapshot: SettingValueSnapshot): void {
		const member = tradeSettings.resolve(snapshot.key);
		if (!member || retiredBackgroundInstanceIds.has(snapshot.instanceId)) return;

		if (snapshot.instanceId !== currentBackgroundInstanceId) {
			if (currentBackgroundInstanceId) retiredBackgroundInstanceIds.add(currentBackgroundInstanceId);
			currentBackgroundInstanceId = snapshot.instanceId;
			settingRevisions.clear();
		}

		const currentRevision = settingRevisions.get(member.key) ?? -1;
		if (snapshot.revision < currentRevision) return;
		settingRevisions.set(member.key, snapshot.revision);
		applyKnownSettingSnapshot(member, snapshot);
		clearError();
	}

	function applyKnownSettingSnapshot(member: TradeSetting, snapshot: SettingValueSnapshot): void {
		switch (member.key) {
			case tradeSettings.translate.key:
				applySettingValue("translate", snapshot.value as TradeSettings["translate"]);
				break;
			case tradeSettings.itemCopy.key:
				applySettingValue("itemCopy", snapshot.value as TradeSettings["itemCopy"]);
				break;
			case tradeSettings.statPreset.key:
				applySettingValue("statPreset", snapshot.value as TradeSettings["statPreset"]);
				break;
		}
	}

	function applySettingValue<TKey extends keyof TradeSettings>(key: TKey, value: TradeSettings[TKey]): void {
		settings.value = {
			...(settings.value ?? tradeSettings.createDefaults()),
			[key]: value,
		};
	}

	function onSettingPersistenceFailed(error: SettingPersistenceError): void {
		const member = tradeSettings.resolve(error.key);
		if (!member || retiredBackgroundInstanceIds.has(error.instanceId)) return;
		if (currentBackgroundInstanceId && error.instanceId !== currentBackgroundInstanceId) return;
		// 异步保存错误可能晚于更新快照到达；旧 revision 不能覆盖或污染较新的权威状态。
		if (error.revision < (settingRevisions.get(member.key) ?? -1)) return;
		setError(SettingsServiceErrorCode.PersistenceFailed, new Error(error.message));
	}

	return {
		settings,
		isLoading,
		isSaving,
		lastError,
		loadSettings,
		setSetting,
	};
});

if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot));
}
