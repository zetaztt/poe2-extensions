import { IpcConnectionHub, type IpcConnection } from "@poe2-extensions/core/ipc";
import { createTabIpcClient, installRuntimeIpcServer } from "@poe2-extensions/ipc-webextension";

export function createBackgroundIpcMain(): IpcConnectionHub<void> {
	const hub = new IpcConnectionHub<void>(() => {
		throw new Error("background 不能主动调用 ipcMain 对端");
	});
	installRuntimeIpcServer((connection) => hub.addConnection(connection));
	return hub;
}

export function createTabIpcWindow(): IpcConnectionHub<number | undefined> {
	const tabConnections = new Map<number, IpcConnection>();
	return new IpcConnectionHub((tabId) => {
		if (tabId === undefined) throw new Error("tab IPC 调用 ipcWindow 时必须通过 to(tabId) 指定标签页");

		let connection = tabConnections.get(tabId);
		if (!connection) {
			connection = createTabIpcClient(tabId);
			tabConnections.set(tabId, connection);
		}
		return connection;
	});
}
