import { computed, readonly, ref, shallowRef } from "vue";
import {
	getCurrentTradeSettings,
	getSettingsServiceErrorCode,
	isSettingsServiceLoading,
	loadSettings as loadSettingsFromService,
	SettingsServiceErrorCode,
	SettingsServiceEventType,
	subscribeSettings,
	TradeSetting,
	updateSetting as updateSettingFromService,
	type SettingsServiceEvent,
	type TradeSettings,
} from "../../modules/settings/settings-service";

export interface SettingsStoreError {
	sequence: number;
	code: SettingsServiceErrorCode;
	error: unknown;
}

const settings = ref<TradeSettings | null>(getCurrentTradeSettings());
const isLoading = ref(isSettingsServiceLoading());
const isSaving = ref(false);
const lastError = shallowRef<SettingsStoreError | null>(createInitialError());
let errorSequence = lastError.value?.sequence ?? 0;
let loadPromise: Promise<TradeSettings> | null = null;
let isSubscribed = false;

const readonlySettings = computed<TradeSettings | null>(() => settings.value);
const readonlyIsLoading = readonly(isLoading);
const readonlyIsSaving = readonly(isSaving);
const readonlyLastError = readonly(lastError);

export function useSettingsStore() {
	ensureSubscribed();

	return {
		settings: readonlySettings,
		isLoading: readonlyIsLoading,
		isSaving: readonlyIsSaving,
		lastError: readonlyLastError,
		loadSettings,
		updateSetting,
	};
}

function loadSettings(): Promise<TradeSettings> {
	if (settings.value) return Promise.resolve(settings.value);
	if (loadPromise) return loadPromise;

	isLoading.value = true;
	loadPromise = loadSettingsFromService()
		.then((loadedSettings) => {
			settings.value = loadedSettings;
			return loadedSettings;
		})
		.finally(() => {
			isLoading.value = false;
			loadPromise = null;
		});
	return loadPromise;
}

async function updateSetting(setting: TradeSetting, enabled: boolean): Promise<boolean> {
	if (isSaving.value) throw new Error("设置正在保存中");
	const current = settings.value ?? (await loadSettings());
	const previousSettings = { ...current };

	settings.value = applySetting(current, setting, enabled);
	isSaving.value = true;
	try {
		return await updateSettingFromService(setting, enabled);
	} catch (error) {
		settings.value = getCurrentTradeSettings() ?? previousSettings;
		throw error;
	} finally {
		isSaving.value = false;
	}
}

function ensureSubscribed(): void {
	if (isSubscribed) return;
	isSubscribed = true;
	subscribeSettings(onSettingsServiceEvent);
}

function onSettingsServiceEvent(event: SettingsServiceEvent): void {
	if (event.type === SettingsServiceEventType.Loaded || event.type === SettingsServiceEventType.Changed) {
		settings.value = event.settings;
		lastError.value = null;
		return;
	}

	errorSequence += 1;
	lastError.value = { sequence: errorSequence, code: event.code, error: event.error };
}

function applySetting(current: TradeSettings, setting: TradeSetting, enabled: boolean): TradeSettings {
	if (setting === TradeSetting.Translate) return { ...current, translateEnabled: enabled };
	if (setting === TradeSetting.ItemCopy) return { ...current, itemCopyEnabled: enabled };
	return { ...current, statPresetEnabled: enabled };
}

function createInitialError(): SettingsStoreError | null {
	const code = getSettingsServiceErrorCode();
	return code === SettingsServiceErrorCode.None ? null : { sequence: 1, code, error: null };
}

export { SettingsServiceErrorCode, TradeSetting };
