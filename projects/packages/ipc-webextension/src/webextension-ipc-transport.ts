import browser from "webextension-polyfill";
import {
	createIpcConnection,
	createIpcEnvelope,
	isIpcEnvelope,
	IpcMessageKind,
	IpcScope,
	IpcTarget,
	type IpcConnection,
	type IpcEnvelope,
	type IpcMessage,
} from "@poe2-extensions/core/ipc/transport";

type SendEnvelope = (envelope: IpcEnvelope) => Promise<unknown>;

/**
 * 创建通过 runtime.sendMessage 调用 background ipcMain 的无地址 client connection。
 * 每个运行环境只应创建一次。
 */
export function createRuntimeIpcClient(): IpcConnection {
	return createWebExtensionIpcConnection(
		IpcScope.Main,
		IpcTarget.Server,
		IpcTarget.Clients,
		(envelope) => browser.runtime.sendMessage(envelope),
		installRuntimeEnvelopeListener,
	);
}

/**
 * 安装唯一的 background ipcMain server。
 * 主动 notification 会广播给扩展页面及调用方提供的 content tabs。
 */
export function installRuntimeIpcServer(
	onConnection: (connection: IpcConnection) => void,
	getBroadcastTabIds: () => Promise<readonly number[]> = async () => [],
): () => void {
	const connection = createWebExtensionIpcConnection(
		IpcScope.Main,
		IpcTarget.Clients,
		IpcTarget.Server,
		(envelope) => broadcastRuntimeEnvelope(envelope, getBroadcastTabIds),
		installRuntimeEnvelopeListener,
	);
	onConnection(connection);
	return () => connection.dispose();
}

/**
 * 安装当前 content 入口唯一的 ipcWindow server connection，供 hub 接收 tab 调用并向 Extension clients 发布通知。
 */
export function installTabIpcServer(onConnection: (connection: IpcConnection) => void): () => void {
	const connection = createWebExtensionIpcConnection(
		IpcScope.Window,
		IpcTarget.Clients,
		IpcTarget.Server,
		(envelope) => browser.runtime.sendMessage(envelope),
		installRuntimeEnvelopeListener,
	);
	onConnection(connection);
	return () => connection.dispose();
}

function installRuntimeEnvelopeListener(receive: (value: unknown) => unknown): () => void {
	const listener = (value: unknown) => receive(value);
	browser.runtime.onMessage.addListener(listener);
	return () => browser.runtime.onMessage.removeListener(listener);
}

function createWebExtensionIpcConnection(
	scope: IpcScope,
	outgoingTarget: IpcTarget,
	incomingTarget: IpcTarget,
	sendEnvelope: SendEnvelope,
	installEnvelopeListener: (receive: (value: unknown) => unknown) => () => void,
): IpcConnection {
	// request response 由当前 sendMessage Promise 原路返回；runtime listener 只承接对端主动发送的消息。
	const connection = createIpcConnection(async (message) => {
		const value = await sendEnvelope(createIpcEnvelope(scope, outgoingTarget, message));
		return isIpcEnvelope(value, scope, incomingTarget) ? value.message : undefined;
	});
	connection.onDispose(
		installEnvelopeListener((value) => {
			if (!isIpcEnvelope(value, scope, incomingTarget)) return undefined;
			return receiveWebExtensionMessage(scope, outgoingTarget, connection, value.message);
		}),
	);
	return connection;
}

function receiveWebExtensionMessage(
	scope: IpcScope,
	responseTarget: IpcTarget,
	connection: IpcConnection,
	message: IpcMessage,
): Promise<IpcEnvelope | undefined> | undefined {
	// runtime listener 只有处理 request 时才能返回 Promise，确保 response 由原 sendMessage 调用取得；
	// notification/response 仅送入既有 connection，避免浏览器把无关 listener 当成响应者。
	if (message.kind !== IpcMessageKind.Request) {
		void connection.receive(message);
		return undefined;
	}

	return connection
		.receive(message)
		.then((response) => (response ? createIpcEnvelope(scope, responseTarget, response) : undefined));
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
