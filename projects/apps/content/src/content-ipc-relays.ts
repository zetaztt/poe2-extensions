import browser from "webextension-polyfill";
import { installIpcEnvelopeRelay, IpcRole } from "@poe2-extensions/core/ipc";

/**
 * 在 content composition root 安装 MAIN world 与 background 之间的透明 IPC relay。
 *
 * 每个 content 运行环境只能调用一次，避免重复注册 window 和 runtime listener。
 */
export function installContentIpcRelays(): void {
	// isolated world 只作为 MAIN world 与 background 的透明边界，不拥有 ipcMain channel 或业务状态。
	installIpcEnvelopeRelay({
		sourceRole: IpcRole.Client,
		adapter: {
			addSourceMessageListener(listener) {
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
			sendTargetMessage(envelope) {
				return browser.runtime.sendMessage(envelope);
			},
		},
	});
	installIpcEnvelopeRelay({
		sourceRole: IpcRole.Server,
		adapter: {
			addSourceMessageListener(listener) {
				browser.runtime.onMessage.addListener((message: unknown) => listener(message));
			},
			sendTargetMessage(envelope) {
				window.postMessage(envelope, window.location.origin);
				return Promise.resolve(undefined);
			},
		},
	});
}
