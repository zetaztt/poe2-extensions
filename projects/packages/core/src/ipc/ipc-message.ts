import { isIpcRequestId, type IpcRequestId } from "./ipc-request-id";

/**
 * Core IPC wire message 的判别值；属于跨 transport 共享格式。
 */
export const IpcMessageKind = {
	Request: "request",
	Response: "response",
	Notification: "notification",
} as const;

/**
 * Core IPC 使用的稳定错误码；transport 只负责透传，不应改写。
 */
export const IpcErrorCode = {
	Timeout: -32_000,
	ConnectionDisposed: -32_001,
	MethodNotFound: -32_601,
	InternalError: -32_603,
} as const;

// Symbol.for 允许独立构建产物识别同一领域错误，不能改为模块本地 Symbol。
const ipcErrorMarker = Symbol.for("poe2-extensions:ipc-error");

/**
 * 可通过 wire format 序列化并在调用端还原为 IpcError 的错误数据。
 */
export interface IpcErrorData {
	code: number;
	message: string;
	data?: unknown;
}

/**
 * RPC 请求 wire message。
 * ID 使用 `<epoch chunks>:<sequence>` 的安全整数字符串，避免数值回绕后复用。
 */
export interface IpcRequestMessage {
	kind: typeof IpcMessageKind.Request;
	id: IpcRequestId;
	method: string;
	data?: unknown;
}

/**
 * 与 request id 对应的 RPC 响应；result 与 error 互斥。
 */
export interface IpcResponseMessage {
	kind: typeof IpcMessageKind.Response;
	id: IpcRequestId;
	result?: unknown;
	error?: IpcErrorData;
}

/**
 * 不要求响应的单向通知 wire message。
 */
export interface IpcNotificationMessage {
	kind: typeof IpcMessageKind.Notification;
	method: string;
	data?: unknown;
}

export type IpcMessage = IpcRequestMessage | IpcResponseMessage | IpcNotificationMessage;

/**
 * 可跨独立构建识别并通过 IPC wire format 传递的领域错误。
 */
export class IpcError<TData = unknown> extends Error {
	public readonly [ipcErrorMarker] = true;

	public constructor(
		public readonly code: number,
		message: string,
		public readonly data?: TData,
	) {
		super(message);
		this.name = "IpcError";
	}
}

/**
 * 在 transport 接收边界校验共享 message 结构，拒绝无效 request id 和冲突响应字段。
 */
export function isIpcMessage(value: unknown): value is IpcMessage {
	if (!isRecord(value)) return false;

	switch (value.kind) {
		case IpcMessageKind.Request:
			return isIpcRequestId(value.id) && typeof value.method === "string";
		case IpcMessageKind.Response:
			return (
				isIpcRequestId(value.id)
				&& (value.error === undefined || isIpcErrorData(value.error))
				&& !(value.error !== undefined && "result" in value)
			);
		case IpcMessageKind.Notification:
			return typeof value.method === "string";
		default:
			return false;
	}
}

/**
 * 将任意 handler 异常收敛为稳定的 wire error，避免泄漏非序列化对象。
 */
export function serializeIpcError(error: unknown): IpcErrorData {
	if (isIpcError(error)) {
		return {
			code: error.code,
			message: error.message,
			...(error.data === undefined ? {} : { data: error.data }),
		};
	}
	return {
		code: IpcErrorCode.InternalError,
		message: error instanceof Error ? error.message : "未知 IPC 错误",
	};
}

function isIpcError(value: unknown): value is IpcError {
	return (
		value instanceof Error
		&& (value as IpcError)[ipcErrorMarker] === true
		&& typeof (value as IpcError).code === "number"
	);
}

function isIpcErrorData(value: unknown): value is IpcErrorData {
	return isRecord(value) && Number.isSafeInteger(value.code) && typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
