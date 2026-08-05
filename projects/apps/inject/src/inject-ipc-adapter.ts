import { IpcConnectionHub, IpcRole } from "@poe2-extensions/core/ipc";

/**
 * 创建 MAIN world 的 ipcMain client hub，经 window adapter 和 content relay 调用 background。
 */
export function createMainWorldIpcMain(): IpcConnectionHub {
	return new IpcConnectionHub({
		role: IpcRole.Client,
		adapter: {
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
		},
	});
}
