import {
	createIpcEnvelope,
	createIpcConnection,
	isIpcEnvelope,
	type IpcScope,
	type IpcTarget,
	type IpcConnection,
	type IpcMessage,
} from "@poe2-extensions/core/ipc/transport";

/**
 * 创建通过同源 window.postMessage 通信的连接。
 * Window 没有请求返回通道，response 会按相反逻辑 target 再次发送，入站 target 同时用于过滤自身回声；
 * 调用方负责在所属入口结束时执行 dispose。
 */
export function createWindowIpcConnection(
	scope: IpcScope,
	outgoingTarget: IpcTarget,
	incomingTarget: IpcTarget,
): { connection: IpcConnection; dispose: () => void } {
	const sendMessage = (message: IpcMessage): undefined => {
		window.postMessage(createIpcEnvelope(scope, outgoingTarget, message), window.location.origin);
		return undefined;
	};
	const connection = createIpcConnection(sendMessage);
	const listener = (event: MessageEvent<unknown>) => {
		if (
			event.source !== window
			|| event.origin !== window.location.origin
			|| !isIpcEnvelope(event.data, scope, incomingTarget)
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
