import type { Message as JsonRpcMessage, MessageConnection } from "vscode-jsonrpc/browser";
import {
	createJsonRpcConnection,
	isJsonRpcMessage,
	JsonRpcMessageReader,
	JsonRpcMessageWriter,
} from "./jsonrpc-transport";

export enum WindowIpcChannel {
	Main = "poe2-extensions:jsonrpc:main",
	Window = "poe2-extensions:jsonrpc:window",
}

export enum WindowIpcDirection {
	ContentToMain = "content-to-main",
	MainToContent = "main-to-content",
}

interface WindowJsonRpcEnvelope {
	channel: WindowIpcChannel;
	direction: WindowIpcDirection;
	message: JsonRpcMessage;
}

export function createWindowJsonRpcConnection(
	channel: WindowIpcChannel,
	outgoingDirection: WindowIpcDirection,
	incomingDirection: WindowIpcDirection,
): { connection: MessageConnection; dispose: () => void } {
	const reader = new JsonRpcMessageReader();
	const writer = new JsonRpcMessageWriter((message) => {
		const envelope: WindowJsonRpcEnvelope = {
			channel,
			direction: outgoingDirection,
			message,
		};
		window.postMessage(envelope, window.location.origin);
	});
	const connection = createJsonRpcConnection(reader, writer);
	const listener = (event: MessageEvent<unknown>) => {
		// main world 与 content script 共用页面消息总线，方向校验可避免连接读取自己发出的消息。
		if (
			event.source !== window
			|| event.origin !== window.location.origin
			|| !isWindowJsonRpcEnvelope(event.data)
			|| event.data.channel !== channel
			|| event.data.direction !== incomingDirection
		) {
			return;
		}
		reader.accept(event.data.message);
	};

	window.addEventListener("message", listener);
	return {
		connection,
		dispose: () => {
			window.removeEventListener("message", listener);
			connection.dispose();
		},
	};
}

function isWindowJsonRpcEnvelope(value: unknown): value is WindowJsonRpcEnvelope {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const envelope = value as { channel?: unknown; direction?: unknown; message?: unknown };
	return (
		(envelope.channel === WindowIpcChannel.Main || envelope.channel === WindowIpcChannel.Window)
		&& (envelope.direction === WindowIpcDirection.ContentToMain
			|| envelope.direction === WindowIpcDirection.MainToContent)
		&& isJsonRpcMessage(envelope.message)
	);
}
