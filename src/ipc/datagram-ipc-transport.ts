import browser from "webextension-polyfill";
import {
	Message,
	type Message as JsonRpcMessage,
	type MessageConnection,
	type RequestMessage,
	type ResponseMessage,
} from "vscode-jsonrpc/browser";
import {
	createJsonRpcConnection,
	isJsonRpcMessage,
	JsonRpcMessageReader,
	JsonRpcMessageWriter,
} from "./jsonrpc-transport";

const jsonRpcChannel = "poe2-extensions:jsonrpc";
const jsonRpcConnectMethod = "$/ipc/connect";

interface JsonRpcEnvelope {
	channel: typeof jsonRpcChannel;
	endpointId: string;
	message: JsonRpcMessage;
}

type SendEnvelope = (envelope: JsonRpcEnvelope) => Promise<unknown>;
type InstallEnvelopeListener = (endpointId: string, accept: (message: JsonRpcMessage) => void) => () => void;

export function createRuntimeJsonRpcClient(): MessageConnection {
	return createDatagramClient(
		(envelope) => browser.runtime.sendMessage(envelope),
		(endpointId, accept) => {
			const listener = (value: unknown) => {
				if (!isJsonRpcEnvelope(value) || value.endpointId !== endpointId) return undefined;
				accept(value.message);
				return undefined;
			};
			browser.runtime.onMessage.addListener(listener);
			return () => browser.runtime.onMessage.removeListener(listener);
		},
	);
}

export function announceRuntimeJsonRpcClient(connection: MessageConnection): Promise<void> {
	// Datagram server 只能从入站消息发现 endpoint；主动握手让纯监听环境也能接收后续发布。
	return connection.sendNotification(jsonRpcConnectMethod);
}

export function createTabJsonRpcClient(tabId: number): MessageConnection {
	return createDatagramClient((envelope) => browser.tabs.sendMessage(tabId, envelope));
}

export function installRuntimeJsonRpcServer(onConnection: (connection: MessageConnection) => void): () => void {
	const peers = new Map<string, DatagramServerPeer>();
	const listener = (value: unknown) => {
		if (!isJsonRpcEnvelope(value)) return undefined;

		let peer = peers.get(value.endpointId);
		if (!peer) {
			peer = createDatagramServerPeer(value.endpointId);
			peers.set(value.endpointId, peer);
			onConnection(peer.connection);
		}

		return peer.accept(value.message);
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
): MessageConnection {
	const endpointId = createEndpointId();
	const reader = new JsonRpcMessageReader();
	const writer = new JsonRpcMessageWriter(async (message) => {
		const response = await sendEnvelope({
			channel: jsonRpcChannel,
			endpointId,
			message,
		});
		if (isJsonRpcEnvelope(response) && response.endpointId === endpointId && Message.isResponse(response.message)) {
			reader.accept(response.message);
		}
	});
	const connection = createJsonRpcConnection(reader, writer);
	const removeEnvelopeListener = installEnvelopeListener?.(endpointId, (message) => reader.accept(message));
	if (removeEnvelopeListener) connection.onDispose(removeEnvelopeListener);
	return connection;
}

interface DatagramServerPeer {
	connection: MessageConnection;
	accept(message: JsonRpcMessage): Promise<JsonRpcEnvelope | undefined> | undefined;
}

function createDatagramServerPeer(endpointId: string): DatagramServerPeer {
	const reader = new JsonRpcMessageReader();
	const pendingResponses = new Map<string | number | null, (response: ResponseMessage) => void>();
	const writer = new JsonRpcMessageWriter((message) => {
		if (Message.isResponse(message)) {
			pendingResponses.get(message.id)?.(message);
			pendingResponses.delete(message.id);
			return;
		}

		if (Message.isNotification(message)) {
			// runtime RPC 的响应沿原 sendMessage 返回；主动通知必须另发一条定向 endpoint 消息。
			return browser.runtime
				.sendMessage({ channel: jsonRpcChannel, endpointId, message } satisfies JsonRpcEnvelope)
				.then(() => undefined);
		}
	});
	const connection = createJsonRpcConnection(reader, writer);

	return {
		connection,
		accept(message) {
			if (Message.isNotification(message)) {
				reader.accept(message);
				return undefined;
			}
			if (!Message.isRequest(message)) return undefined;

			return new Promise((resolve) => {
				pendingResponses.set(message.id, (response) => {
					resolve({
						channel: jsonRpcChannel,
						endpointId,
						message: response,
					});
				});
				reader.accept(message as RequestMessage);
			});
		},
	};
}

function isJsonRpcEnvelope(value: unknown): value is JsonRpcEnvelope {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const envelope = value as { channel?: unknown; endpointId?: unknown; message?: unknown };
	return (
		envelope.channel === jsonRpcChannel
		&& typeof envelope.endpointId === "string"
		&& isJsonRpcMessage(envelope.message)
	);
}

function createEndpointId(): string {
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
