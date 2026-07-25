import { ipcMain } from "@poe2-extensions/core/ipc";
import {
	settingsIpcProtocol,
	TradeSetting,
	type TradeSettingsSnapshot,
	type TradeSettingsUpdateResult,
} from "@poe2-extensions/core/settings";

function loadSettings(): Promise<TradeSettingsSnapshot> {
	return ipcMain.invoke(settingsIpcProtocol.load);
}

function updateSetting(setting: TradeSetting, enabled: boolean): Promise<TradeSettingsUpdateResult> {
	return ipcMain.invoke(settingsIpcProtocol.update, { setting, enabled });
}

function subscribeSettings(listener: (snapshot: TradeSettingsSnapshot) => void): () => void {
	return ipcMain.on(settingsIpcProtocol.changed, listener);
}

export const settingsService = {
	loadSettings,
	updateSetting,
	subscribeSettings,
};
