import browser from "webextension-polyfill";
import { IpcAddressedConnectionHub, type IpcAddressedConnectionHubTransport } from "@poe2-extensions/core/ipc";
import { IpcScope, IpcTarget } from "@poe2-extensions/core/ipc/transport";

const browserTabIpcTransport: IpcAddressedConnectionHubTransport<number> = {
	sendMessage: (tabId, envelope) => browser.tabs.sendMessage(tabId, envelope),
	addMessageListener(listener) {
		browser.runtime.onMessage.addListener((value: unknown, sender: browser.Runtime.MessageSender) =>
			listener(value, sender.tab?.id),
		);
	},
};

/**
 * 创建使用 browser.tabs/runtime 消息 API 的 tabId 寻址 channel backend。
 * 每个运行环境只应创建一次。
 */
export function createTabIpcChannelBackend(): IpcAddressedConnectionHub<number> {
	return new IpcAddressedConnectionHub({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: browserTabIpcTransport,
	});
}
