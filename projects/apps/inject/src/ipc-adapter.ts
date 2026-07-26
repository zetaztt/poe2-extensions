import { IpcConnectionHub } from "@poe2-extensions/core/ipc";
import { createWindowIpcConnection, WindowIpcChannel, WindowIpcDirection } from "@poe2-extensions/ipc-window";

export function createMainWorldIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(
		WindowIpcChannel.Main,
		WindowIpcDirection.MainToContent,
		WindowIpcDirection.ContentToMain,
	);
	const hub = new IpcConnectionHub<void>(() => windowTransport.connection);
	hub.addConnection(windowTransport.connection);
	return hub;
}

export function createMainWorldIpcWindow(): IpcConnectionHub<number | undefined> {
	const windowTransport = createWindowIpcConnection(
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
