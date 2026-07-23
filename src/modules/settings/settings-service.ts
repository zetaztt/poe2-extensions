import { ipcMain } from "../../ipc/ipc";
import { settingsIpcProtocol } from "./settings-ipc-protocol";
import {
	TradeSetting,
	type TradeSettings,
	type TradeSettingsSnapshot,
	type TradeSettingsUpdateResult,
} from "./settings-types";

export enum SettingsServiceErrorCode {
	None = 0,
	LoadFailed = 1,
	UpdateFailed = 2,
}

export enum SettingsServiceEventType {
	Loaded = 1,
	Changed = 2,
	Error = 3,
}

export type SettingsServiceEvent =
	| { type: SettingsServiceEventType.Loaded; settings: TradeSettings }
	| { type: SettingsServiceEventType.Changed; settings: TradeSettings }
	| { type: SettingsServiceEventType.Error; code: SettingsServiceErrorCode; error: unknown };

let currentSettings: TradeSettings | null = null;
// background service worker 重启会重置 revision，instanceId 用于隔离两个生命周期。
let currentBackgroundInstanceId = "";
let currentSettingsRevision = -1;
const retiredBackgroundInstanceIds = new Set<string>();
let isSettingsLoading = false;
let settingsServiceErrorCode = SettingsServiceErrorCode.None;
let areSettingsNotificationsInstalled = false;
const listeners = new Set<(event: SettingsServiceEvent) => void>();

export { TradeSetting };
export type { TradeSettings } from "./settings-types";

export function getCurrentTradeSettings(): TradeSettings | null {
	return currentSettings;
}

export function isSettingsServiceLoading(): boolean {
	return isSettingsLoading;
}

export function getSettingsServiceErrorCode(): SettingsServiceErrorCode {
	return settingsServiceErrorCode;
}

export function subscribeSettings(listener: (event: SettingsServiceEvent) => void): () => void {
	ensureSettingsNotificationsInstalled();
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export async function loadSettings(): Promise<TradeSettings> {
	ensureSettingsNotificationsInstalled();
	isSettingsLoading = true;
	settingsServiceErrorCode = SettingsServiceErrorCode.None;

	try {
		const snapshot = await ipcMain.invoke(settingsIpcProtocol.load);
		return applySettingsSnapshot(snapshot, SettingsServiceEventType.Loaded, true);
	} catch (error) {
		publishSettingsError(SettingsServiceErrorCode.LoadFailed, error);
		throw error;
	} finally {
		isSettingsLoading = false;
	}
}

export async function updateSetting(setting: TradeSetting, enabled: boolean): Promise<boolean> {
	ensureSettingsNotificationsInstalled();

	try {
		const result = await ipcMain.invoke(settingsIpcProtocol.update, { setting, enabled });
		applySettingsSnapshot(result, SettingsServiceEventType.Changed);
		return result.activeTradeTabUpdated;
	} catch (error) {
		publishSettingsError(SettingsServiceErrorCode.UpdateFailed, error);
		throw error;
	}
}

function ensureSettingsNotificationsInstalled(): void {
	if (areSettingsNotificationsInstalled) return;
	areSettingsNotificationsInstalled = true;
	ipcMain.on(settingsIpcProtocol.changed, (snapshot) => {
		applySettingsSnapshot(snapshot, SettingsServiceEventType.Changed);
	});
}

function applySettingsSnapshot(
	snapshot: TradeSettingsSnapshot | TradeSettingsUpdateResult,
	type: SettingsServiceEventType.Loaded | SettingsServiceEventType.Changed,
	force = false,
): TradeSettings {
	if (retiredBackgroundInstanceIds.has(snapshot.instanceId)) return currentSettings ?? snapshot.settings;

	const isNewBackgroundInstance = snapshot.instanceId !== currentBackgroundInstanceId;
	const isNewerRevision = snapshot.revision > currentSettingsRevision;
	const isOlderRevision = snapshot.revision < currentSettingsRevision;
	if (!isNewBackgroundInstance && isOlderRevision) return currentSettings ?? snapshot.settings;
	if (!force && !isNewBackgroundInstance && !isNewerRevision) return currentSettings ?? snapshot.settings;

	if (isNewBackgroundInstance || isNewerRevision || !currentSettings) {
		if (isNewBackgroundInstance && currentBackgroundInstanceId) {
			retiredBackgroundInstanceIds.add(currentBackgroundInstanceId);
		}
		currentBackgroundInstanceId = snapshot.instanceId;
		currentSettingsRevision = snapshot.revision;
		currentSettings = snapshot.settings;
	}

	settingsServiceErrorCode = SettingsServiceErrorCode.None;
	publishSettingsEvent({ type, settings: currentSettings });
	return currentSettings;
}

function publishSettingsError(code: SettingsServiceErrorCode, error: unknown): void {
	settingsServiceErrorCode = code;
	publishSettingsEvent({ type: SettingsServiceEventType.Error, code, error });
}

function publishSettingsEvent(event: SettingsServiceEvent): void {
	for (const listener of listeners) {
		try {
			listener(event);
		} catch (error) {
			console.error("[poe2-extensions] 设置 service 事件处理失败", error);
		}
	}
}
