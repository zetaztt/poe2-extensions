import { IpcConnectionHub } from "./ipc-connection-hub";
import { createWindowJsonRpcConnection, WindowIpcChannel, WindowIpcDirection } from "./window-ipc-transport";

export function createMainWorldIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowJsonRpcConnection(
		WindowIpcChannel.Main,
		WindowIpcDirection.MainToContent,
		WindowIpcDirection.ContentToMain,
	);
	return new IpcConnectionHub<void>(() => windowTransport.connection);
}

export function createMainWorldIpcWindow(): IpcConnectionHub<number | undefined> {
	const windowTransport = createWindowJsonRpcConnection(
		WindowIpcChannel.Window,
		WindowIpcDirection.MainToContent,
		WindowIpcDirection.ContentToMain,
	);
	const hub = new IpcConnectionHub<number | undefined>((tabId) => {
		if (tabId !== undefined) throw new Error("main world 不能通过 ipcWindow.to(tabId) 寻址其他标签页");
		return windowTransport.connection;
	});
	hub.addConnection(windowTransport.connection);
	return hub;
}
