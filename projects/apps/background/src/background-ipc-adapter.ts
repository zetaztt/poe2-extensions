import browser from "webextension-polyfill";
import { IpcHandlerConnectionHub, type IpcAddressedConnectionHub } from "@poe2-extensions/core/ipc";
import { IpcScope, IpcTarget } from "@poe2-extensions/core/ipc/transport";
import { createRuntimeIpcServerTransport, createTabIpcChannelBackend } from "@poe2-extensions/ipc-webextension";

/**
 * 创建 background 的 ipcMain 服务端 hub。
 * 主动通知同时覆盖扩展页面和当前存在的 trade2 content tabs。
 */
export function createBackgroundIpcMain(): IpcHandlerConnectionHub {
	return new IpcHandlerConnectionHub({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Clients,
		incomingTarget: IpcTarget.Server,
		transport: createRuntimeIpcServerTransport(IpcScope.Main, IpcTarget.Clients, IpcTarget.Server, async () => {
			const tabs = await browser.tabs.query({ url: "https://www.pathofexile.com/trade2*" });
			return tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
		}),
	});
}

/**
 * 创建 background/side-panel 使用的无状态 tabId ipcWindow backend。
 */
export function createTabIpcWindow(): IpcAddressedConnectionHub<number> {
	return createTabIpcChannelBackend();
}
