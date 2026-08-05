import browser from "webextension-polyfill";
import { IpcHandlerConnectionHub, IpcRole, type IpcEnvelope } from "@poe2-extensions/core/ipc";

async function broadcastRuntimeEnvelope(envelope: IpcEnvelope): Promise<undefined> {
	let tabIds: readonly number[] = [];
	try {
		tabIds = await getAllTabIds();
	} catch (error) {
		console.warn("[poe2-extensions] 查询 IPC 广播标签页失败", error);
	}

	// runtime.sendMessage 只覆盖扩展页面；content scripts 必须按 tabId 单独投递。
	const sends: Promise<unknown>[] = [browser.runtime.sendMessage(envelope)];
	for (const tabId of tabIds) sends.push(browser.tabs.sendMessage(tabId, envelope));
	await Promise.allSettled(sends);
	return undefined;
}

/**
 * 返回当前浏览器中可用于 tabs.sendMessage 的全部标签页 ID。
 * 未注入 content script 的发送错误由广播调用方隔离。
 */
async function getAllTabIds(): Promise<readonly number[]> {
	const tabs = await browser.tabs.query({
		url: "https://www.pathofexile.com/trade2*",
	});
	return tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
}

/**
 * 创建 background 的 ipcMain 服务端 hub。
 * 主动通知同时覆盖扩展页面和当前浏览器中存在的 tabs。
 */
export function createBackgroundIpcMain(): IpcHandlerConnectionHub {
	return new IpcHandlerConnectionHub({
		role: IpcRole.Server,
		adapter: {
			async sendMessage(envelope) {
				return broadcastRuntimeEnvelope(envelope);
			},
			addMessageListener(listener) {
				browser.runtime.onMessage.addListener((message: unknown) => listener(message));
			},
		},
	});
}
