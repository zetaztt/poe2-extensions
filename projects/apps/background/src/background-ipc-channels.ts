import { IpcHandlerChannel } from "@poe2-extensions/core/ipc";
import { createBackgroundIpcMain } from "./background-ipc-adapter";

/**
 * background 持有跨扩展环境的权威业务 handler，是 ipcMain 的唯一 RPC 服务端。
 */
export const ipcMain = new IpcHandlerChannel(createBackgroundIpcMain());
