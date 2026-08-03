import browser from "webextension-polyfill";
import type { IpcConnectionHubTransport } from "@poe2-extensions/core/ipc";
import {
	createIpcEnvelope,
	ipcPublishedNotificationMethod,
	isIpcEnvelope,
	isPublishedNotification,
	IpcMessageKind,
	maxRememberedPublishedNotifications,
	type IpcEnvelope,
	type IpcScope,
	type IpcTarget,
} from "@poe2-extensions/core/ipc/transport";

/**
 * 创建通过 runtime.sendMessage 调用 background 的无地址 client transport。
 */
export function createRuntimeIpcClientTransport(): IpcConnectionHubTransport {
	return createRuntimeMessageTransport((envelope) => browser.runtime.sendMessage(envelope));
}

/**
 * 创建 background ipcMain server transport。
 * 主动发送会广播给扩展页面及调用方提供的 content tabs。
 */
export function createRuntimeIpcServerTransport(
	scope: IpcScope,
	outgoingTarget: IpcTarget,
	incomingTarget: IpcTarget,
	getBroadcastTabIds: () => Promise<readonly number[]> = async () => [],
): IpcConnectionHubTransport {
	const publishedNotificationIds = new Set<string>();
	const publishedNotificationIdOrder: string[] = [];
	return {
		async sendMessage(envelope) {
			rememberPublishedEnvelope(envelope);
			return broadcastRuntimeEnvelope(envelope, getBroadcastTabIds);
		},
		addMessageListener(listener) {
			browser.runtime.onMessage.addListener((value: unknown) => {
				const result = listener(value);
				const envelope = getPublishedEnvelope(value, scope, incomingTarget);
				if (envelope && rememberPublishedEnvelope(envelope)) {
					void broadcastRuntimeEnvelope(
						createIpcEnvelope(scope, outgoingTarget, envelope.message),
						getBroadcastTabIds,
					);
				}
				return result;
			});
		},
	};

	function rememberPublishedEnvelope(envelope: IpcEnvelope): boolean {
		const message = envelope.message;
		if (
			message.kind !== IpcMessageKind.Notification
			|| message.method !== ipcPublishedNotificationMethod
			|| !isPublishedNotification(message.data)
			|| publishedNotificationIds.has(message.data.id)
		) {
			return false;
		}

		publishedNotificationIds.add(message.data.id);
		publishedNotificationIdOrder.push(message.data.id);
		if (publishedNotificationIdOrder.length > maxRememberedPublishedNotifications) {
			const expiredId = publishedNotificationIdOrder.shift();
			if (expiredId) publishedNotificationIds.delete(expiredId);
		}
		return true;
	}
}

/**
 * 创建 content ipcWindow server transport，响应和主动消息均通过 runtime 通道返回 Extension 环境。
 */
export function createTabIpcServerTransport(): IpcConnectionHubTransport {
	return createRuntimeMessageTransport((envelope) => browser.runtime.sendMessage(envelope));
}

function createRuntimeMessageTransport(
	sendMessage: (envelope: IpcEnvelope) => Promise<unknown>,
): IpcConnectionHubTransport {
	return {
		sendMessage,
		addMessageListener(listener) {
			browser.runtime.onMessage.addListener((value: unknown) => listener(value));
		},
	};
}

function getPublishedEnvelope(value: unknown, scope: IpcScope, incomingTarget: IpcTarget): IpcEnvelope | undefined {
	return isIpcEnvelope(value, scope, incomingTarget) ? value : undefined;
}

async function broadcastRuntimeEnvelope(
	envelope: IpcEnvelope,
	getBroadcastTabIds: () => Promise<readonly number[]>,
): Promise<undefined> {
	let tabIds: readonly number[] = [];
	try {
		tabIds = await getBroadcastTabIds();
	} catch (error) {
		console.warn("[poe2-extensions] 查询 IPC 广播标签页失败", error);
	}

	// runtime.sendMessage 只覆盖扩展页面；content scripts 必须按 tabId 通过 tabs.sendMessage 单独广播。
	const sends: Promise<unknown>[] = [browser.runtime.sendMessage(envelope)];
	for (const tabId of tabIds) sends.push(browser.tabs.sendMessage(tabId, envelope));
	await Promise.allSettled(sends);
	return undefined;
}
