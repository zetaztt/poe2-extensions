import type { IpcChannelBackend } from "@poe2-extensions/core/ipc";
import {
	createIpcConnection,
	createIpcEnvelope,
	isIpcEnvelope,
	IpcScope,
	IpcTarget,
	type IpcConnection,
	type IpcEnvelope,
	type IpcMessage,
} from "@poe2-extensions/core/ipc/transport";

type NotificationHandler = (address: number, data: unknown) => void | Promise<void>;

interface RegisteredNotificationHandler {
	handler: NotificationHandler;
}

/** 隔离浏览器消息 API，使无状态 tab 路由可以使用纯消息平台验证。 */
export interface TabIpcRouterPlatform {
	sendTabMessage(tabId: number, envelope: IpcEnvelope): Promise<unknown>;
	addClientMessageListener(listener: (value: unknown, senderTabId: number | undefined) => unknown): void;
}

/**
 * 创建以 tabId 寻址的无状态 channel backend；仅单次 RPC 保留临时 connection，不记录标签页在线状态。
 * Router 会安装运行环境级入站 listener，同一环境只应创建一次。
 */
export function createTabIpcChannelRouter(platform: TabIpcRouterPlatform): IpcChannelBackend<number> {
	const notificationHandlers = new Map<string, RegisteredNotificationHandler>();

	// tabId 直接来自每条入站消息；没有在线状态，因此也不需要导航或关闭生命周期监听。
	platform.addClientMessageListener((value, senderTabId) => {
		if (!isIpcEnvelope(value, IpcScope.Window, IpcTarget.Clients) || senderTabId === undefined) {
			return undefined;
		}
		return receiveTabIpcMessage(senderTabId, value.message);
	});

	return {
		async invoke(address, method, params, timeoutMs) {
			const connection = createTabIpcConnection(platform, address);
			try {
				return await connection.sendRequest(method, params, Date.now() + timeoutMs);
			} finally {
				connection.dispose();
			}
		},
		async send(address, method, data) {
			const connection = createTabIpcConnection(platform, address);
			try {
				await connection.sendNotification(method, data);
			} finally {
				connection.dispose();
			}
		},
		on(method, handler) {
			const registration = { handler };
			notificationHandlers.set(method, registration);
			return () => {
				if (notificationHandlers.get(method) === registration) notificationHandlers.delete(method);
			};
		},
	};

	async function receiveTabIpcMessage(address: number, message: IpcMessage): Promise<IpcEnvelope | undefined> {
		const connection = createIpcConnection(() => undefined);
		connection.onNotification((method, data) => notificationHandlers.get(method)?.handler(address, data));
		try {
			const response = await connection.receive(message);
			return response ? createIpcEnvelope(IpcScope.Window, IpcTarget.Server, response) : undefined;
		} finally {
			connection.dispose();
		}
	}
}

function createTabIpcConnection(platform: TabIpcRouterPlatform, tabId: number): IpcConnection {
	// 临时 connection 只持有单次调用的 token 和 timeout。每个 sendMessage Promise 原路返回自己的 response，
	// 因此不同调用的 request ID 无需全局唯一；dispose 只清理本地状态，不能取消浏览器已经发出的消息。
	return createIpcConnection(async (message) => {
		const value = await platform.sendTabMessage(
			tabId,
			createIpcEnvelope(IpcScope.Window, IpcTarget.Server, message),
		);
		return isIpcEnvelope(value, IpcScope.Window, IpcTarget.Clients) ? value.message : undefined;
	});
}
