import { IpcConnectionHub, type IpcAddressedConnectionHub } from "@poe2-extensions/core/ipc";
import { IpcScope, IpcTarget } from "@poe2-extensions/core/ipc/transport";
import { createRuntimeIpcClientTransport, createTabIpcChannelBackend } from "@poe2-extensions/ipc-webextension";

/**
 * 创建 side-panel 的 ipcMain client hub，并持有该页面唯一的 runtime connection。
 */
export function createRuntimeIpcMain(): IpcConnectionHub {
	return new IpcConnectionHub({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: createRuntimeIpcClientTransport(),
	});
}

/**
 * 创建 side-panel 使用的无状态 tabId ipcWindow backend。
 */
export function createTabIpcWindow(): IpcAddressedConnectionHub<number> {
	return createTabIpcChannelBackend();
}
