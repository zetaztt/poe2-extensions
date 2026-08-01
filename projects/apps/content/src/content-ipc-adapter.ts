import { IpcConnectionHub } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcClient, installTabIpcServer } from "@poe2-extensions/ipc-webextension";
import { createWindowIpcConnection, IpcScope, IpcTarget } from "@poe2-extensions/ipc-window";

/**
 * 创建 isolated world 的 ipcMain relay，将 MAIN world 调用转发到 background runtime connection。
 */
export function createContentIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Main, IpcTarget.Clients, IpcTarget.Server);
	const runtimeConnection = createRuntimeIpcClient();
	const hub = new IpcConnectionHub<void>(() => runtimeConnection);
	hub.addConnection(runtimeConnection);
	hub.addRelay(windowTransport.connection, undefined);
	return hub;
}

/**
 * 创建 isolated world 的 ipcWindow relay，连接 Extension tab 消息与 MAIN world 页面服务端。
 */
export function createContentIpcWindow(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Window, IpcTarget.Server, IpcTarget.Clients);
	const hub = new IpcConnectionHub<void>(() => windowTransport.connection);
	hub.addConnection(windowTransport.connection);
	installTabIpcServer((connection) => hub.addRelay(connection, undefined));
	return hub;
}
