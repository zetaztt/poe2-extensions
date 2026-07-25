import { IpcConnectionHub, type MessageConnection } from "@poe2-extensions/core/ipc";
import {
	announceRuntimeJsonRpcClient,
	createRuntimeJsonRpcClient,
	createTabJsonRpcClient,
} from "@poe2-extensions/ipc-webextension";

export function createRuntimeIpcMain(): IpcConnectionHub<void> {
	const connection = createRuntimeJsonRpcClient();
	const hub = new IpcConnectionHub<void>(() => connection);
	hub.addConnection(connection);
	void announceRuntimeJsonRpcClient(connection).catch((error) => {
		console.warn("[poe2-extensions] runtime IPC 连接握手失败", error);
	});
	return hub;
}

export function createTabIpcWindow(): IpcConnectionHub<number | undefined> {
	const tabConnections = new Map<number, MessageConnection>();
	return new IpcConnectionHub((tabId) => {
		if (tabId === undefined) throw new Error("tab IPC 调用 ipcWindow 时必须通过 to(tabId) 指定标签页");

		let connection = tabConnections.get(tabId);
		if (!connection) {
			connection = createTabJsonRpcClient(tabId);
			tabConnections.set(tabId, connection);
		}
		return connection;
	});
}
