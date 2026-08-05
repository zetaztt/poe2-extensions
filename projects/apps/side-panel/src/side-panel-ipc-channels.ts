import { IpcChannel } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcMain } from "./side-panel-ipc-adapter";

/**
 * side-panel 调用 background 的权威业务能力，不处理 ipcMain RPC。
 */
export const ipcMain = new IpcChannel(createRuntimeIpcMain());
