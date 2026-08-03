import { isIpcMessage, type IpcMessage } from "./ipc-message";

// 该值同时识别扩展 IPC 和 wire format；只有不兼容的 envelope 变更才能升级。
const ipcVersion = "poe2-extensions:ipc:4";

/**
 * 区分共享 transport 上互不相干的 background RPC 与 MAIN world RPC 链路。
 */
export enum IpcScope {
	Main = "main",
	Window = "window",
}

/**
 * 表示消息面向的逻辑 IPC 角色，而不是 background/content 等物理运行环境。
 */
export enum IpcTarget {
	Server = "server",
	Clients = "clients",
}

/**
 * Transport 用于识别、隔离和承载 Core IPC message 的统一 wire envelope。
 */
export interface IpcEnvelope {
	version: typeof ipcVersion;
	scope: IpcScope;
	target: IpcTarget;
	message: IpcMessage;
}

/**
 * 使用当前 wire version 包装一条待发送的 Core IPC message。
 */
export function createIpcEnvelope(scope: IpcScope, target: IpcTarget, message: IpcMessage): IpcEnvelope {
	return {
		version: ipcVersion,
		scope,
		target,
		message,
	};
}

/**
 * 仅接受当前 version 且属于预期逻辑链路和角色的 envelope。
 */
export function isIpcEnvelope(value: unknown, scope: IpcScope, target: IpcTarget): value is IpcEnvelope {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const envelope = value as { version?: unknown; scope?: unknown; target?: unknown; message?: unknown };
	return (
		envelope.version === ipcVersion
		&& envelope.scope === scope
		&& envelope.target === target
		&& isIpcMessage(envelope.message)
	);
}
