import {
	createIpcConnection,
	isIpcMessage,
	type IpcConnection,
	type IpcMessage,
} from "@poe2-extensions/core/ipc/transport";

export enum WindowIpcChannel {
	Main = "poe2-extensions:ipc:main:v1",
	Window = "poe2-extensions:ipc:window:v1",
}

export enum WindowIpcDirection {
	ContentToMain = "content-to-main",
	MainToContent = "main-to-content",
}

interface WindowIpcEnvelope {
	channel: WindowIpcChannel;
	direction: WindowIpcDirection;
	message: IpcMessage;
}

export function createWindowIpcConnection(
	channel: WindowIpcChannel,
	outgoingDirection: WindowIpcDirection,
	incomingDirection: WindowIpcDirection,
): { connection: IpcConnection; dispose: () => void } {
	const sendMessage = (message: IpcMessage): undefined => {
		window.postMessage(
			{
				channel,
				direction: outgoingDirection,
				message,
			} satisfies WindowIpcEnvelope,
			window.location.origin,
		);
		return undefined;
	};
	const connection = createIpcConnection(sendMessage);
	const listener = (event: MessageEvent<unknown>) => {
		if (
			event.source !== window
			|| event.origin !== window.location.origin
			|| !isWindowIpcEnvelope(event.data)
			|| event.data.channel !== channel
			|| event.data.direction !== incomingDirection
		) {
			return;
		}

		void connection
			.receive(event.data.message)
			.then((response) => {
				if (response) sendMessage(response);
			})
			.catch((error) => {
				console.error("[poe2-extensions] window IPC 消息处理失败", error);
			});
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

function isWindowIpcEnvelope(value: unknown): value is WindowIpcEnvelope {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const envelope = value as { channel?: unknown; direction?: unknown; message?: unknown };
	return (
		(envelope.channel === WindowIpcChannel.Main || envelope.channel === WindowIpcChannel.Window)
		&& (envelope.direction === WindowIpcDirection.ContentToMain
			|| envelope.direction === WindowIpcDirection.MainToContent)
		&& isIpcMessage(envelope.message)
	);
}
