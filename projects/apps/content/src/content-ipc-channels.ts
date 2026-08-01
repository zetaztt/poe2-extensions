import { IpcChannel, ipcMainRegistrationKey, ipcWindowRegistrationKey } from "@poe2-extensions/core/ipc";
import { createContentIpcMain, createContentIpcWindow } from "./content-ipc-adapter";

/**
 * isolated world 通过 window/runtime relay 调用 background，不拥有 ipcMain handler。
 */
export const ipcMain = new IpcChannel<void>(ipcMainRegistrationKey, false, createContentIpcMain);
/**
 * isolated world relay Extension 与 MAIN world 消息，不拥有 ipcWindow handler。
 */
export const ipcWindow = new IpcChannel<void>(ipcWindowRegistrationKey, false, createContentIpcWindow);
