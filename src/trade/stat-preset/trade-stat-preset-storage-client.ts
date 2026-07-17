import { ipcMain } from "../../ipc/ipc";
import { tradeIpcProtocol } from "../trade-ipc-protocol";
import type { TradeStatPreset } from "../trade-types";

export function requestPresetList(): Promise<TradeStatPreset[]> {
	return ipcMain.invoke(tradeIpcProtocol.listStatPresets);
}

export function requestSavePreset(preset: TradeStatPreset): Promise<TradeStatPreset[]> {
	return ipcMain.invoke(tradeIpcProtocol.saveStatPreset, { preset });
}

export function requestRenamePreset(oldName: string, newName: string): Promise<TradeStatPreset[]> {
	return ipcMain.invoke(tradeIpcProtocol.renameStatPreset, { oldName, newName });
}

export function requestDeletePreset(name: string): Promise<TradeStatPreset[]> {
	return ipcMain.invoke(tradeIpcProtocol.deleteStatPreset, { name });
}
