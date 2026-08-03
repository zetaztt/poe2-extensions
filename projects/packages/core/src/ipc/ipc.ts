import {
	defaultRequestTimeoutMs,
	getNotificationMember,
	getRegisteredIpcBackend,
	getRpcMember,
	registerIpcBackend,
	type IpcArguments,
	type NotificationData,
	type RpcParams,
	type RpcResult,
} from "./ipc-utils";
import type { IpcNotificationDefinition, IpcRpcDefinition } from "./ipc-protocol";

type IpcHandler<TParams, TResult> = (...args: IpcArguments<TParams>) => TResult | Promise<TResult>;
type IpcNotificationListener<TData> = (...args: IpcArguments<TData>) => void | Promise<void>;

/**
 * 在当前 transport 中调用和发布的无地址 channel backend 契约。
 */
export interface IpcChannelBackend {
	invoke(method: string, params: unknown | undefined, timeoutMs: number): Promise<unknown>;
	send(method: string, data: unknown | undefined): Promise<void>;
	on(method: string, handler: (data: unknown) => void | Promise<void>): () => void;
}

/**
 * 为无地址 backend 增加 RPC handler 注册能力。
 */
export interface IpcHandlerChannelBackend extends IpcChannelBackend {
	handle(method: string, handler: (params: unknown) => unknown | Promise<unknown>): () => void;
}

/**
 * 将具名 protocol member 映射到无地址 backend。
 * 构造时按稳定 key 首次注册当前运行环境的 backend。
 */
export class IpcChannel {
	public constructor(
		protected readonly registrationKey: symbol,
		factory: () => IpcChannelBackend,
	) {
		registerIpcBackend(registrationKey, factory);
	}

	public invoke<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		...args: IpcArguments<RpcParams<TMember>>
	): Promise<RpcResult<TMember>> {
		return invoke(this.registrationKey, member, args[0]);
	}

	/**
	 * 向当前 transport 发布 notification。
	 */
	public send<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		...args: IpcArguments<NotificationData<TMember>>
	): Promise<void> {
		return send(this.registrationKey, member, args[0]);
	}

	public on<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		listener: IpcNotificationListener<NotificationData<TMember>>,
	): () => void {
		return on(this.registrationKey, member, listener);
	}
}

/**
 * 为无地址 channel 增加 RPC 服务端注册能力。
 */
export class IpcHandlerChannel extends IpcChannel {
	public constructor(registrationKey: symbol, factory: () => IpcHandlerChannelBackend) {
		super(registrationKey, factory);
	}

	public handle<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		handler: IpcHandler<RpcParams<TMember>, RpcResult<TMember>>,
	): () => void {
		return handle(this.registrationKey, member, handler);
	}
}

async function invoke<TMember extends IpcRpcDefinition<any, any>>(
	registrationKey: symbol,
	descriptor: TMember,
	params: unknown | undefined,
): Promise<RpcResult<TMember>> {
	const member = getRpcMember(descriptor);
	const timeoutMs = member.timeoutMs ?? defaultRequestTimeoutMs;
	const result = await getBackend(registrationKey).invoke(member.method, params, timeoutMs);
	return result as RpcResult<TMember>;
}

function send<TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	descriptor: TMember,
	data: unknown | undefined,
): Promise<void> {
	const member = getNotificationMember(descriptor);
	return getBackend(registrationKey).send(member.method, data);
}

function handle<TMember extends IpcRpcDefinition<any, any>>(
	registrationKey: symbol,
	descriptor: TMember,
	handler: IpcHandler<RpcParams<TMember>, RpcResult<TMember>>,
): () => void {
	const member = getRpcMember(descriptor);
	return getHandlerBackend(registrationKey).handle(member.method, (params) =>
		(handler as unknown as (params: unknown) => unknown)(params),
	);
}

function on<TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	descriptor: TMember,
	listener: IpcNotificationListener<NotificationData<TMember>>,
): () => void {
	const member = getNotificationMember(descriptor);
	return getBackend(registrationKey).on(member.method, (data) =>
		(listener as unknown as (data: unknown) => void | Promise<void>)(data),
	);
}

function getBackend(registrationKey: symbol): IpcChannelBackend {
	return getRegisteredIpcBackend<IpcChannelBackend>(registrationKey);
}

function getHandlerBackend(registrationKey: symbol): IpcHandlerChannelBackend {
	return getRegisteredIpcBackend<IpcHandlerChannelBackend>(registrationKey);
}
