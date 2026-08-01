import { IpcConnectionHub, type IpcChannelBackend } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcClient, createTabIpcChannelBackend } from "@poe2-extensions/ipc-webextension";

/**
 * 创建 side-panel 的 ipcMain client hub，并持有该页面唯一的 runtime connection。
 */
export function createRuntimeIpcMain(): IpcConnectionHub<void> {
	const connection = createRuntimeIpcClient();
	const hub = new IpcConnectionHub<void>(() => connection);
	hub.addConnection(connection);
	return hub;
}

/**
 * 创建 side-panel 使用的无状态 tabId ipcWindow backend。
 */
export function createTabIpcWindow(): IpcChannelBackend<number> {
	return createTabIpcChannelBackend();
}
