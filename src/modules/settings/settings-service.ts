import { ipcMain } from "../../ipc/ipc";
import { settingsIpcProtocol } from "./settings-ipc-protocol";
import { TradeSetting, type TradeSettingsSnapshot, type TradeSettingsUpdateResult } from "./settings-types";

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
