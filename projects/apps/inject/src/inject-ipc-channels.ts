import { IpcChannel } from "@poe2-extensions/core/ipc";
import { createMainWorldIpcMain } from "./inject-ipc-adapter";

/**
 * MAIN world 通过 content relay 调用 background，不处理 ipcMain RPC。
 */
export const ipcMain = new IpcChannel(createMainWorldIpcMain());
