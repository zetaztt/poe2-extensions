import {
	defaultRequestTimeoutMs,
	getNotificationMember,
	getRpcMember,
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
 * 将具名 protocol member 映射到当前运行环境的无地址 backend。
 *
 * 每个 channel 独占一个 backend。
 * 独立构建产物必须各自安装消息监听，避免共享连接时互相覆盖 notification handler。
 */
export class IpcChannel<TBackend extends IpcChannelBackend = IpcChannelBackend> {
	protected readonly backend: TBackend;

	public constructor(backend: TBackend) {
		this.backend = backend;
	}

	public async invoke<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		...args: IpcArguments<RpcParams<TMember>>
	): Promise<RpcResult<TMember>> {
		const rpcMember = getRpcMember(member);
		const timeoutMs = rpcMember.timeoutMs ?? defaultRequestTimeoutMs;
		const result = await this.backend.invoke(rpcMember.method, args[0], timeoutMs);
		return result as RpcResult<TMember>;
	}

	/**
	 * 向当前 transport 发布 notification。
	 */
	public send<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		...args: IpcArguments<NotificationData<TMember>>
	): Promise<void> {
		const notificationMember = getNotificationMember(member);
		return this.backend.send(notificationMember.method, args[0]);
	}

	public on<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		listener: IpcNotificationListener<NotificationData<TMember>>,
	): () => void {
		const notificationMember = getNotificationMember(member);
		return this.backend.on(notificationMember.method, (data) =>
			(listener as unknown as (data: unknown) => void | Promise<void>)(data),
		);
	}
}

/**
 * 为无地址 channel 增加 RPC 服务端注册能力。
 */
export class IpcHandlerChannel extends IpcChannel<IpcHandlerChannelBackend> {
	public constructor(backend: IpcHandlerChannelBackend) {
		super(backend);
	}

	public handle<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		handler: IpcHandler<RpcParams<TMember>, RpcResult<TMember>>,
	): () => void {
		const rpcMember = getRpcMember(member);
		return this.backend.handle(rpcMember.method, (params) =>
			(handler as unknown as (params: unknown) => unknown)(params),
		);
	}
}
