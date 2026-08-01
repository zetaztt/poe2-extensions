import { IpcChannel, ipcMainRegistrationKey, ipcWindowRegistrationKey } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcMain, createTabIpcWindow } from "./side-panel-ipc-adapter";

/**
 * side-panel 调用 background 的权威业务能力，不处理 ipcMain RPC。
 */
export const ipcMain = new IpcChannel<void>(ipcMainRegistrationKey, false, createRuntimeIpcMain);
/**
 * side-panel 使用 tabId 调用和监听页面能力，不处理反向 ipcWindow RPC。
 */
export const ipcWindow = new IpcChannel<number>(ipcWindowRegistrationKey, true, createTabIpcWindow);
