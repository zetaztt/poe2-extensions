import { IpcConnectionHub } from "@poe2-extensions/core/ipc";
import { createWindowIpcConnection, IpcScope, IpcTarget } from "@poe2-extensions/ipc-window";

export function createMainWorldIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Main, IpcTarget.Server, IpcTarget.Clients);
	const hub = new IpcConnectionHub<void>(() => windowTransport.connection);
	hub.addConnection(windowTransport.connection);
	return hub;
}

export function createMainWorldIpcWindow(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Window, IpcTarget.Clients, IpcTarget.Server);
	const hub = new IpcConnectionHub<void>(() => windowTransport.connection);
	hub.addConnection(windowTransport.connection);
	return hub;
}
