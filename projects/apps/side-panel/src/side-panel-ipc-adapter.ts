import { IpcConnectionHub, type IpcChannelBackend } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcClient, createTabIpcChannelBackend } from "@poe2-extensions/ipc-webextension";

export function createRuntimeIpcMain(): IpcConnectionHub<void> {
	const connection = createRuntimeIpcClient();
	const hub = new IpcConnectionHub<void>(() => connection);
	hub.addConnection(connection);
	return hub;
}

export function createTabIpcWindow(): IpcChannelBackend<number> {
	return createTabIpcChannelBackend();
}
