import {
	IpcChannel,
	IpcHandlerChannel,
	ipcMainRegistrationKey,
	ipcWindowRegistrationKey,
} from "@poe2-extensions/core/ipc";
import { createBackgroundIpcMain, createTabIpcWindow } from "./background-ipc-adapter";

/** background 持有跨扩展环境的权威业务 handler，是 ipcMain 的唯一 RPC 服务端。 */
export const ipcMain = new IpcHandlerChannel<void>(ipcMainRegistrationKey, false, createBackgroundIpcMain);
/** background 使用 tabId 定向调用 MAIN world，但不接受反向 ipcWindow RPC。 */
export const ipcWindow = new IpcChannel<number>(ipcWindowRegistrationKey, true, createTabIpcWindow);
