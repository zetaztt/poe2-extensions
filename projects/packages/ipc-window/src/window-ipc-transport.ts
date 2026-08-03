import type { IpcConnectionHubTransport } from "@poe2-extensions/core/ipc";

/**
 * 创建通过同源 window.postMessage 发送和接收原始 IPC envelope 的 transport。
 * scope 与 target 由使用该 transport 的 Hub 校验，因此同一页面可安全安装多个逻辑链路。
 */
export function createWindowIpcTransport(): IpcConnectionHubTransport {
	return {
		sendMessage(envelope) {
			window.postMessage(envelope, window.location.origin);
			return Promise.resolve(undefined);
		},
		addMessageListener(listener) {
			window.addEventListener("message", (event: MessageEvent<unknown>) => {
				if (event.source !== window || event.origin !== window.location.origin) return;
				void Promise.resolve(listener(event.data))
					.then((response) => {
						if (response !== undefined) window.postMessage(response, window.location.origin);
					})
					.catch((error) => {
						console.error("[poe2-extensions] window IPC 消息处理失败", error);
					});
			});
		},
	};
}
