import {
	IpcChannel,
	IpcHandlerChannel,
	ipcMainRegistrationKey,
	ipcWindowRegistrationKey,
} from "@poe2-extensions/core/ipc";
import { createMainWorldIpcMain, createMainWorldIpcWindow } from "./inject-ipc-adapter";

/**
 * MAIN world 通过 content relay 调用 background，不处理 ipcMain RPC。
 */
export const ipcMain = new IpcChannel<void>(ipcMainRegistrationKey, false, createMainWorldIpcMain);
/**
 * MAIN world 持有页面能力，是 ipcWindow 的唯一 RPC 服务端。
 */
export const ipcWindow = new IpcHandlerChannel<void>(ipcWindowRegistrationKey, false, createMainWorldIpcWindow);
