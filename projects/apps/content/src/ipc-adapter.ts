import { IpcConnectionHub } from "@poe2-extensions/core/ipc";
import {
	announceRuntimeJsonRpcClient,
	createRuntimeJsonRpcClient,
	installRuntimeJsonRpcServer,
} from "@poe2-extensions/ipc-webextension";
import { createWindowJsonRpcConnection, WindowIpcChannel, WindowIpcDirection } from "@poe2-extensions/ipc-window";

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
