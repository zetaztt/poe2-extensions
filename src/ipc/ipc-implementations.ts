import type { MessageConnection } from "vscode-jsonrpc/browser";
import {
	announceRuntimeJsonRpcClient,
	createRuntimeJsonRpcClient,
	createTabJsonRpcClient,
	installRuntimeJsonRpcServer,
} from "./datagram-ipc-transport";
import { IpcConnectionHub } from "./ipc-connection-hub";
import { createWindowJsonRpcConnection, WindowIpcChannel, WindowIpcDirection } from "./window-ipc-transport";

export function createBackgroundIpcMain(): IpcConnectionHub<void> {
	const hub = new IpcConnectionHub<void>(() => {
		throw new Error("background 不能主动调用 ipcMain 对端");
	});
	installRuntimeJsonRpcServer((connection) => hub.addConnection(connection));
	return hub;
}

export function createRuntimeIpcMain(): IpcConnectionHub<void> {
	const connection = createRuntimeJsonRpcClient();
	const hub = new IpcConnectionHub<void>(() => connection);
	hub.addConnection(connection);
	void announceRuntimeJsonRpcClient(connection).catch((error) => {
		console.warn("[poe2-extensions] runtime IPC 连接握手失败", error);
	});
	return hub;
}

export function createContentIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowJsonRpcConnection(
		WindowIpcChannel.Main,
		WindowIpcDirection.ContentToMain,
		WindowIpcDirection.MainToContent,
	);
	const runtimeConnection = createRuntimeJsonRpcClient();
	const hub = new IpcConnectionHub<void>(() => runtimeConnection);
	hub.addConnection(runtimeConnection);
	hub.addRelay(windowTransport.connection, undefined);
	void announceRuntimeJsonRpcClient(runtimeConnection).catch((error) => {
		console.warn("[poe2-extensions] runtime IPC 连接握手失败", error);
	});
	return hub;
}

export function createSidePanelIpcWindow(): IpcConnectionHub<number | undefined> {
	const tabConnections = new Map<number, MessageConnection>();
	return new IpcConnectionHub((tabId) => {
		if (tabId === undefined) throw new Error("sidepanel 调用 ipcWindow 时必须通过 to(tabId) 指定标签页");

		let connection = tabConnections.get(tabId);
		if (!connection) {
			connection = createTabJsonRpcClient(tabId);
			tabConnections.set(tabId, connection);
		}
		return connection;
	});
}

export function createContentIpcWindow(): IpcConnectionHub<number | undefined> {
	const windowTransport = createWindowJsonRpcConnection(
		WindowIpcChannel.Window,
		WindowIpcDirection.ContentToMain,
		WindowIpcDirection.MainToContent,
	);
	const hub = new IpcConnectionHub<number | undefined>((tabId) => {
		if (tabId !== undefined) throw new Error("content 不能通过 ipcWindow.to(tabId) 寻址其他标签页");
		return windowTransport.connection;
	});
	hub.addConnection(windowTransport.connection);
	installRuntimeJsonRpcServer((connection) => hub.addRelay(connection, undefined));
	return hub;
}
