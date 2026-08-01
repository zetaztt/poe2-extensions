import { ipcMain } from "../../side-panel-ipc-channels";
import {
	settingsIpcProtocol,
	type AnySettingMember,
	type SettingMemberSnapshot,
	type SettingPersistenceError,
} from "@poe2-extensions/core/settings";
import { tradeIpcProtocol } from "@poe2-extensions/core/trade";

type SettingMemberSnapshots<TMembers extends readonly AnySettingMember[]> = {
	[K in keyof TMembers]: TMembers[K] extends AnySettingMember ? SettingMemberSnapshot<TMembers[K]> : never;
};

function getValues<const TMembers extends readonly AnySettingMember[]>(
	members: TMembers,
): Promise<SettingMemberSnapshots<TMembers>> {
	// getValues 的保序协议保证响应位置与 member tuple 对齐，此处只恢复 IPC 擦除的关联类型。
	return ipcMain.invoke(settingsIpcProtocol.getValues, {
		settings: members.map((member) => ({
			key: member.key,
			defaultValue: member.defaultValue,
		})),
	}) as Promise<SettingMemberSnapshots<TMembers>>;
}

function setTranslateEnabled(enabled: boolean): Promise<boolean> {
	return ipcMain.invoke(tradeIpcProtocol.setTranslateEnabled, { enabled });
}

function setItemCopyEnabled(enabled: boolean): Promise<boolean> {
	return ipcMain.invoke(tradeIpcProtocol.setItemCopyEnabled, { enabled });
}

function setStatPresetEnabled(enabled: boolean): Promise<boolean> {
	return ipcMain.invoke(tradeIpcProtocol.setStatPresetEnabled, { enabled });
}

function subscribeSettings(
	listener: (snapshot: SettingMemberSnapshot<AnySettingMember>) => void,
	onPersistenceFailed: (error: SettingPersistenceError) => void,
): () => void {
	const unsubscribeChanged = ipcMain.on(settingsIpcProtocol.onChanged, listener);
	const unsubscribePersistenceFailed = ipcMain.on(settingsIpcProtocol.persistenceFailed, onPersistenceFailed);
	return () => {
		unsubscribeChanged();
		unsubscribePersistenceFailed();
	};
}

/**
 * settings IPC 的无状态页面 service；返回普通快照，不持有 Pinia 或响应式状态。
 */
export const settingsService = {
	getValues,
	setTranslateEnabled,
	setItemCopyEnabled,
	setStatPresetEnabled,
	subscribeSettings,
};
