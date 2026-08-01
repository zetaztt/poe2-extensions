import browser from "webextension-polyfill";
import type { IpcChannelBackend } from "@poe2-extensions/core/ipc";
import { createTabIpcChannelRouter, type TabIpcRouterPlatform } from "./tab-ipc-channel-router";

const browserTabIpcPlatform: TabIpcRouterPlatform = {
	sendTabMessage: (tabId, envelope) => browser.tabs.sendMessage(tabId, envelope),
	addClientMessageListener(listener) {
		browser.runtime.onMessage.addListener((value: unknown, sender: browser.Runtime.MessageSender) =>
			listener(value, sender.tab?.id),
		);
	},
};

/** 创建使用 browser.tabs/runtime 消息 API 的 tabId 寻址 channel backend；每个运行环境只应创建一次。 */
export function createTabIpcChannelBackend(): IpcChannelBackend<number> {
	return createTabIpcChannelRouter(browserTabIpcPlatform);
}
