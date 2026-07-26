import { IpcConnectionHub, type IpcConnection } from "@poe2-extensions/core/ipc";
import {
	announceRuntimeIpcClient,
	createRuntimeIpcClient,
	createTabIpcClient,
} from "@poe2-extensions/ipc-webextension";

export function createRuntimeIpcMain(): IpcConnectionHub<void> {
	const connection = createRuntimeIpcClient();
	const hub = new IpcConnectionHub<void>(() => connection);
	hub.addConnection(connection);
	void announceRuntimeIpcClient(connection).catch((error) => {
		console.warn("[poe2-extensions] runtime IPC 连接握手失败", error);
	});
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
