import browser from "webextension-polyfill";
import {
	createIpcConnection,
	isIpcMessage,
	IpcMessageKind,
	type IpcConnection,
	type IpcMessage,
	type IpcResponseMessage,
} from "@poe2-extensions/core/ipc/transport";

const ipcChannel = "poe2-extensions:ipc:v1";
const ipcConnectMethod = "$/ipc/connect";

interface IpcEnvelope {
	channel: typeof ipcChannel;
	endpointId: string;
	message: IpcMessage;
}

type SendEnvelope = (envelope: IpcEnvelope) => Promise<unknown>;
type InstallEnvelopeListener = (
	endpointId: string,
	receive: (message: IpcMessage) => Promise<IpcResponseMessage | undefined>,
) => () => void;

export function createRuntimeIpcClient(): IpcConnection {
	return createDatagramClient(
		(envelope) => browser.runtime.sendMessage(envelope),
		(endpointId, receive) => {
			const listener = (value: unknown) => {
				if (!isIpcEnvelope(value) || value.endpointId !== endpointId) return undefined;
				return receive(value.message).then((response) =>
					response
						? ({
								channel: ipcChannel,
								endpointId,
								message: response,
							} satisfies IpcEnvelope)
						: undefined,
				);
			};
			browser.runtime.onMessage.addListener(listener);
			return () => browser.runtime.onMessage.removeListener(listener);
		},
	);
}

export function announceRuntimeIpcClient(connection: IpcConnection): Promise<void> {
	// Datagram server 只能从入站消息发现 endpoint；主动握手让纯监听环境也能接收后续发布。
	return connection.sendNotification(ipcConnectMethod);
}

export function createTabIpcClient(tabId: number): IpcConnection {
	return createDatagramClient((envelope) => browser.tabs.sendMessage(tabId, envelope));
}

export function installRuntimeIpcServer(onConnection: (connection: IpcConnection) => void): () => void {
	const peers = new Map<string, IpcServerPeer>();
	const listener = (value: unknown) => {
		if (!isIpcEnvelope(value)) return undefined;

		let peer = peers.get(value.endpointId);
		if (!peer) {
			peer = createIpcServerPeer(value.endpointId);
			peers.set(value.endpointId, peer);
			onConnection(peer.connection);
		}

		return peer.receive(value.message);
	};

	browser.runtime.onMessage.addListener(listener);
	return () => {
		browser.runtime.onMessage.removeListener(listener);
		for (const peer of peers.values()) peer.connection.dispose();
		peers.clear();
	};
}

function createDatagramClient(
	sendEnvelope: SendEnvelope,
	installEnvelopeListener?: InstallEnvelopeListener,
): IpcConnection {
	const endpointId = createEndpointId();
	const connection = createIpcConnection(async (message) => {
		const value = await sendEnvelope({
			channel: ipcChannel,
			endpointId,
			message,
		});
		return isIpcEnvelope(value) && value.endpointId === endpointId ? value.message : undefined;
	});
	const removeEnvelopeListener = installEnvelopeListener?.(endpointId, (message) => connection.receive(message));
	if (removeEnvelopeListener) connection.onDispose(removeEnvelopeListener);
	return connection;
}

interface IpcServerPeer {
	connection: IpcConnection;
	receive(message: IpcMessage): Promise<IpcEnvelope | undefined> | undefined;
}

function createIpcServerPeer(endpointId: string): IpcServerPeer {
	const connection = createIpcConnection(async (message) => {
		const value = await browser.runtime.sendMessage({
			channel: ipcChannel,
			endpointId,
			message,
		} satisfies IpcEnvelope);
		return isIpcEnvelope(value) && value.endpointId === endpointId ? value.message : undefined;
	});

	return {
		connection,
		receive(message) {
			if (message.kind === IpcMessageKind.Response) {
				void connection.receive(message);
				return undefined;
			}
			return connection.receive(message).then((response) =>
				response
					? {
							channel: ipcChannel,
							endpointId,
							message: response,
						}
					: undefined,
			);
		},
	};
}

function isIpcEnvelope(value: unknown): value is IpcEnvelope {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const envelope = value as { channel?: unknown; endpointId?: unknown; message?: unknown };
	return envelope.channel === ipcChannel && typeof envelope.endpointId === "string" && isIpcMessage(envelope.message);
}

function createEndpointId(): string {
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
