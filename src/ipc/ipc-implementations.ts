import type { MessageConnection } from "vscode-jsonrpc/browser";
import {
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
	let connection: MessageConnection | null = null;
	return new IpcConnectionHub<void>(() => {
		connection ??= createRuntimeJsonRpcClient();
		return connection;
	});
}

export function createContentIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowJsonRpcConnection(
		WindowIpcChannel.Main,
		WindowIpcDirection.ContentToMain,
		WindowIpcDirection.MainToContent,
	);
	let runtimeConnection: MessageConnection | null = null;
	const hub = new IpcConnectionHub<void>(() => {
		runtimeConnection ??= createRuntimeJsonRpcClient();
		return runtimeConnection;
	});
	hub.addRelay(windowTransport.connection, undefined);
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
	installRuntimeJsonRpcServer((connection) => hub.addRelay(connection, undefined));
	return hub;
}
