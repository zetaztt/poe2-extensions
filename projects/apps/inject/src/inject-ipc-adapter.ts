import { IpcConnectionHub, IpcHandlerConnectionHub } from "@poe2-extensions/core/ipc";
import { createWindowIpcTransport, IpcScope, IpcTarget } from "@poe2-extensions/ipc-window";

/**
 * 创建 MAIN world 的 ipcMain client hub，经 window transport 和 content relay 调用 background。
 */
export function createMainWorldIpcMain(): IpcConnectionHub {
	return new IpcConnectionHub({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: createWindowIpcTransport(),
	});
}

/**
 * 创建 MAIN world 的 ipcWindow handler hub，只承接当前页面能力。
 */
export function createMainWorldIpcWindow(): IpcHandlerConnectionHub {
	return new IpcHandlerConnectionHub({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Clients,
		incomingTarget: IpcTarget.Server,
		transport: createWindowIpcTransport(),
	});
}
