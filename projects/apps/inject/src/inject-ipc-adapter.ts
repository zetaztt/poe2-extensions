import { IpcConnectionHub } from "@poe2-extensions/core/ipc";
import { createWindowIpcConnection, IpcScope, IpcTarget } from "@poe2-extensions/ipc-window";

/**
 * 创建 MAIN world 的 ipcMain client hub，经 window transport 和 content relay 调用 background。
 */
export function createMainWorldIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Main, IpcTarget.Server, IpcTarget.Clients);
	const hub = new IpcConnectionHub<void>(() => windowTransport.connection);
	hub.addConnection(windowTransport.connection);
	return hub;
}

/**
 * 创建 MAIN world 的 ipcWindow handler hub，只承接当前页面能力。
 */
export function createMainWorldIpcWindow(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Window, IpcTarget.Clients, IpcTarget.Server);
	const hub = new IpcConnectionHub<void>(() => windowTransport.connection);
	hub.addConnection(windowTransport.connection);
	return hub;
}
