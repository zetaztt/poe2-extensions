import browser from "webextension-polyfill";
import { IpcConnectionHub, IpcRole } from "@poe2-extensions/core/ipc";

/**
 * 创建 side-panel 的 ipcMain client hub，并持有该页面唯一的 runtime connection。
 */
export function createRuntimeIpcMain(): IpcConnectionHub {
	return new IpcConnectionHub({
		role: IpcRole.Client,
		adapter: {
			sendMessage(envelope) {
				return browser.runtime.sendMessage(envelope);
			},
			addMessageListener(listener) {
				browser.runtime.onMessage.addListener((message: unknown) => listener(message));
			},
		},
	});
}
