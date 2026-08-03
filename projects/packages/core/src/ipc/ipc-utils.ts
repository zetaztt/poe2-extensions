import { IpcError, IpcErrorCode } from "./ipc-message";
import {
	IpcProtocolMemberKind,
	type AnyIpcProtocolMember,
	type IpcNotificationDefinition,
	type IpcRpcDefinition,
} from "./ipc-protocol";

export type RpcParams<TMember> = TMember extends IpcRpcDefinition<infer TParams, any> ? TParams : never;
export type RpcResult<TMember> = TMember extends IpcRpcDefinition<any, infer TResult> ? TResult : never;
export type NotificationData<TMember> = TMember extends IpcNotificationDefinition<infer TData> ? TData : never;
export type IpcArguments<TData> = [TData] extends [void] ? [] : [data: TData];

/**
 * 跨 transport 传播的内部发布数据，字段属于 wire 约定。
 */
export interface IpcPublishedNotification {
	id: string;
	method: string;
	data?: unknown;
}

export const defaultRequestTimeoutMs = 10_000;
/**
 * 发布使用保留 method 跨 transport 传播；普通 notification 仍保持点对点语义。
 */
export const ipcPublishedNotificationMethod = "$/ipc/publish";
export const maxRememberedPublishedNotifications = 256;
/**
 * 跨独立构建复用当前环境 ipcMain backend 的稳定注册标识，不得随实现重命名。
 */
export const ipcMainRegistrationKey = Symbol.for("poe2-extensions:ipc-main");
/**
 * 跨独立构建复用当前环境 ipcWindow backend 的稳定注册标识，不得随实现重命名。
 */
export const ipcWindowRegistrationKey = Symbol.for("poe2-extensions:ipc-window");
const ipcScope = globalThis as Record<PropertyKey, unknown>;

export function registerIpcBackend<TBackend>(registrationKey: symbol, factory: () => TBackend): void {
	if (ipcScope[registrationKey]) return;

	// main-world 的独立构建产物会重复注册；只有首个 factory 可以创建消息监听和连接。
	ipcScope[registrationKey] = factory();
}

export function getRegisteredIpcBackend<TBackend>(registrationKey: symbol): TBackend {
	const backend = ipcScope[registrationKey] as TBackend | undefined;
	if (!backend) throw new Error("IPC 通道尚未注册当前运行环境实现");
	return backend;
}

export function getRpcMember(member: AnyIpcProtocolMember): IpcRpcDefinition<unknown, unknown> {
	if (member.kind !== IpcProtocolMemberKind.Rpc) throw invalidMethodError(member.method);
	return member;
}

export function getNotificationMember(member: AnyIpcProtocolMember): IpcNotificationDefinition<unknown> {
	if (member.kind !== IpcProtocolMemberKind.Notification) throw invalidMethodError(member.method);
	return member;
}

export function createPublishedNotification(method: string, data: unknown | undefined): IpcPublishedNotification {
	return {
		id: createPublishedNotificationId(),
		method,
		...(data === undefined ? {} : { data }),
	};
}

export function isPublishedNotification(value: unknown): value is IpcPublishedNotification {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const notification = value as { id?: unknown; method?: unknown };
	return typeof notification.id === "string" && typeof notification.method === "string";
}

function invalidMethodError(method: string): IpcError {
	return new IpcError(IpcErrorCode.MethodNotFound, `IPC 方法不存在或类型不匹配: ${method}`);
}

function createPublishedNotificationId(): string {
	if (crypto?.randomUUID) return crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
