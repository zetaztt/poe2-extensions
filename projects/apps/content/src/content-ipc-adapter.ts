import { IpcConnectionHub } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcClient, installTabIpcServer } from "@poe2-extensions/ipc-webextension";
import { createWindowIpcConnection, IpcScope, IpcTarget } from "@poe2-extensions/ipc-window";

export function createContentIpcMain(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Main, IpcTarget.Clients, IpcTarget.Server);
	const runtimeConnection = createRuntimeIpcClient();
	const hub = new IpcConnectionHub<void>(() => runtimeConnection);
	hub.addConnection(runtimeConnection);
	hub.addRelay(windowTransport.connection, undefined);
	return hub;
}

export function createContentIpcWindow(): IpcConnectionHub<void> {
	const windowTransport = createWindowIpcConnection(IpcScope.Window, IpcTarget.Server, IpcTarget.Clients);
	const hub = new IpcConnectionHub<void>(() => windowTransport.connection);
	hub.addConnection(windowTransport.connection);
	installTabIpcServer((connection) => hub.addRelay(connection, undefined));
	return hub;
}
