import { IpcEnvelopeRelay } from "@poe2-extensions/core/ipc";
import { createRuntimeIpcClientTransport, createTabIpcServerTransport } from "@poe2-extensions/ipc-webextension";
import { createWindowIpcTransport, IpcScope, IpcTarget } from "@poe2-extensions/ipc-window";

/**
 * 在 content composition root 安装两条跨 isolated/MAIN world 的透明 IPC relay。
 *
 * 每个 content 运行环境只能调用一次，避免重复注册 window 和 runtime listener。
 */
export function installContentIpcRelays(): void {
	// isolated world 只作为 MAIN world 与 background 的透明边界，不拥有 ipcMain channel 或业务状态。
	new IpcEnvelopeRelay({
		first: {
			scope: IpcScope.Main,
			incomingTarget: IpcTarget.Server,
			transport: createWindowIpcTransport(),
		},
		second: {
			scope: IpcScope.Main,
			incomingTarget: IpcTarget.Clients,
			transport: createRuntimeIpcClientTransport(),
		},
	});

	// tab IPC 请求与 MAIN world 响应保持原 envelope 往返，content 不参与 handler 或请求状态管理。
	new IpcEnvelopeRelay({
		first: {
			scope: IpcScope.Window,
			incomingTarget: IpcTarget.Server,
			transport: createTabIpcServerTransport(),
		},
		second: {
			scope: IpcScope.Window,
			incomingTarget: IpcTarget.Clients,
			transport: createWindowIpcTransport(),
		},
	});
}
