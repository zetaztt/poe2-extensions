import { isIpcMessage, type IpcMessage } from "./ipc-message";

// 该值同时识别扩展 IPC 和 wire format；只有不兼容的 envelope 变更才能升级。
const ipcVersion = "poe2-extensions:ipc:8";

/**
 * 表示 envelope 发送方的逻辑 IPC 角色，而不是 background/content 等物理运行环境。
 * 该字段只支持路由校验，不提供发送方身份认证。
 */
export enum IpcRole {
	Server = "server",
	Client = "client",
}

/**
 * Transport 用于识别和承载 Core IPC message 的统一 wire envelope。
 */
export interface IpcEnvelope {
	version: typeof ipcVersion;
	source: IpcRole;
	message: IpcMessage;
}

/**
 * 使用当前 wire version 和发送方角色包装一条待发送的 Core IPC message。
 */
export function createIpcEnvelope(source: IpcRole, message: IpcMessage): IpcEnvelope {
	return {
		version: ipcVersion,
		source,
		message,
	};
}

/**
 * 仅接受当前 version、预期发送方角色和合法业务消息的 envelope。
 */
export function isIpcEnvelope(value: unknown, expectedSource: IpcRole): value is IpcEnvelope {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const envelope = value as { version?: unknown; source?: unknown; message?: unknown };
	return envelope.version === ipcVersion && envelope.source === expectedSource && isIpcMessage(envelope.message);
}

/**
 * 返回当前角色唯一允许接收的对端角色。
 *
 * 无地址 IPC 只有 Server 和 Client 两种互补角色；新增角色时必须在此处显式定义路由关系。
 */
export function getPeerIpcRole(role: IpcRole): IpcRole {
	switch (role) {
		case IpcRole.Server:
			return IpcRole.Client;
		case IpcRole.Client:
			return IpcRole.Server;
	}
}
