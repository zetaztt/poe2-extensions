import { IpcError, IpcErrorCode, type IpcRequestContext } from "./ipc-connection";
import {
	IpcProtocolMemberKind,
	type AnyIpcProtocolMember,
	type IpcNotificationDefinition,
	type IpcRpcDefinition,
} from "./ipc-protocol";

type RpcParams<TMember> = TMember extends IpcRpcDefinition<infer TParams, any> ? TParams : never;
type RpcResult<TMember> = TMember extends IpcRpcDefinition<any, infer TResult> ? TResult : never;
type NotificationData<TMember> = TMember extends IpcNotificationDefinition<infer TData> ? TData : never;
type IpcArguments<TData> = [TData] extends [void] ? [] : [data: TData];
type IpcAddressArguments<TAddress> = [TAddress] extends [void] ? [] : [address: TAddress];
type IpcHandler<TAddress, TParams, TResult> = (
	...args: [...IpcAddressArguments<TAddress>, ...IpcArguments<TParams>]
) => TResult | Promise<TResult>;
type IpcNotificationListener<TAddress, TData> = (
	...args: [...IpcAddressArguments<TAddress>, ...IpcArguments<TData>]
) => void | Promise<void>;

// Channel 只依赖调用和监听能力，使有状态 connection hub 与无状态 transport 可以使用同一门面。
interface IpcChannelBackendBase<TAddress> {
	invoke(address: TAddress, method: string, params: unknown | undefined, timeoutMs: number): Promise<unknown>;
	on(method: string, handler: (address: TAddress, data: unknown) => void | Promise<void>): () => void;
}

interface IpcAddressedChannelBackend<TAddress> extends IpcChannelBackendBase<TAddress> {
	send(address: TAddress, method: string, data: unknown | undefined): Promise<void>;
}

interface IpcUnaddressedChannelBackend<TAddress> extends IpcChannelBackendBase<TAddress> {
	publish(method: string, data: unknown | undefined): Promise<void>;
}

/**
 * 按 address 类型选择 publish 或点对点 send 能力的运行环境 backend 契约。
 */
export type IpcChannelBackend<TAddress> = [TAddress] extends [void]
	? IpcUnaddressedChannelBackend<TAddress>
	: IpcAddressedChannelBackend<TAddress>;
/**
 * 在基础 channel backend 上增加 RPC 服务端注册能力。
 */
export type IpcHandlerChannelBackend<TAddress> = IpcChannelBackend<TAddress> & {
	handle(
		method: string,
		handler: (address: TAddress, params: unknown, context: IpcRequestContext) => unknown | Promise<unknown>,
	): () => void;
};

const defaultRequestTimeoutMs = 10_000;
/**
 * 跨独立构建复用当前环境 ipcMain backend 的稳定注册标识，不得随实现重命名。
 */
export const ipcMainRegistrationKey = Symbol.for("poe2-extensions:ipc-main");
/**
 * 跨独立构建复用当前环境 ipcWindow backend 的稳定注册标识，不得随实现重命名。
 */
export const ipcWindowRegistrationKey = Symbol.for("poe2-extensions:ipc-window");
const ipcScope = globalThis as Record<PropertyKey, unknown>;

/**
 * 将具名 protocol member 映射到当前运行环境 backend，并在首次构造时完成稳定全局注册。
 */
export class IpcChannel<TAddress = void> {
	/**
	 * addressed 必须与 TAddress 是否为 void 一致，门面据此解析 variadic 参数并选择 send 或 publish。
	 */
	public constructor(
		protected readonly registrationKey: symbol,
		protected readonly addressed: [TAddress] extends [void] ? false : true,
		factory: () => IpcChannelBackend<TAddress>,
	) {
		if (ipcScope[registrationKey]) return;

		// main-world 的独立构建产物会重复注册；只有首个 factory 可以创建消息监听和连接。
		ipcScope[registrationKey] = factory();
	}

	/**
	 * 发起 RPC。
	 * 有地址 channel 将 address 作为首参，无地址 channel 直接从 member 开始。
	 */
	public invoke<TMember extends IpcRpcDefinition<any, any>>(
		...args: [...IpcAddressArguments<TAddress>, member: TMember, ...IpcArguments<RpcParams<TMember>>]
	): Promise<RpcResult<TMember>> {
		const offset = this.addressed ? 1 : 0;
		const address = (this.addressed ? args[0] : undefined) as TAddress;
		const member = args[offset] as TMember;
		const memberArgs = args.slice(offset + 1) as IpcArguments<RpcParams<TMember>>;
		return invoke(this.registrationKey, address, member, memberArgs);
	}

	/**
	 * 有地址时点对点发送 notification，无地址时向当前 hub 拓扑发布。
	 */
	public send<TMember extends IpcNotificationDefinition<any>>(
		...args: [...IpcAddressArguments<TAddress>, member: TMember, ...IpcArguments<NotificationData<TMember>>]
	): Promise<void> {
		const offset = this.addressed ? 1 : 0;
		const address = (this.addressed ? args[0] : undefined) as TAddress;
		const member = args[offset] as TMember;
		const memberArgs = args.slice(offset + 1) as IpcArguments<NotificationData<TMember>>;
		return this.addressed
			? send(this.registrationKey, address, member, memberArgs)
			: publish(this.registrationKey, member, memberArgs);
	}

	/**
	 * 监听所有来源 notification。
	 * 有地址 channel 提供实际来源，同 method 后注册者会替换旧 listener。
	 */
	public on<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		listener: IpcNotificationListener<TAddress, NotificationData<TMember>>,
	): () => void {
		return on(this.registrationKey, this.addressed, member, listener);
	}
}

/**
 * 仅供拥有对应 RPC 服务端职责的运行环境使用的 channel 门面。
 */
export class IpcHandlerChannel<TAddress = void> extends IpcChannel<TAddress> {
	/**
	 * 构造时立即注册带 handler 能力的 backend，并沿用 IpcChannel 的单例注册规则。
	 */
	public constructor(
		registrationKey: symbol,
		addressed: [TAddress] extends [void] ? false : true,
		factory: () => IpcHandlerChannelBackend<TAddress>,
	) {
		super(registrationKey, addressed, factory);
	}

	/**
	 * 注册全局 RPC handler。
	 * 有地址 backend 提供请求来源，同 method 后注册者会替换旧 handler。
	 */
	public handle<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		handler: IpcHandler<TAddress, RpcParams<TMember>, RpcResult<TMember>>,
	): () => void {
		return handle(this.registrationKey, this.addressed, member, handler);
	}
}

async function invoke<TAddress, TMember extends IpcRpcDefinition<any, any>>(
	registrationKey: symbol,
	address: TAddress,
	descriptor: TMember,
	args: IpcArguments<RpcParams<TMember>>,
): Promise<RpcResult<TMember>> {
	const member = getRpcMember(descriptor);
	const result = await getIpcChannelBackend<TAddress>(registrationKey).invoke(
		address,
		member.method,
		args[0],
		member.timeoutMs ?? defaultRequestTimeoutMs,
	);
	return result as RpcResult<TMember>;
}

function send<TAddress, TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	address: TAddress,
	descriptor: TMember,
	args: IpcArguments<NotificationData<TMember>>,
): Promise<void> {
	const member = getNotificationMember(descriptor);
	return getIpcAddressedChannelBackend<TAddress>(registrationKey).send(address, member.method, args[0]);
}

function publish<TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	descriptor: TMember,
	args: IpcArguments<NotificationData<TMember>>,
): Promise<void> {
	const member = getNotificationMember(descriptor);
	return getIpcChannelBackend<void>(registrationKey).publish(member.method, args[0]);
}

function handle<TAddress, TMember extends IpcRpcDefinition<any, any>>(
	registrationKey: symbol,
	addressed: boolean,
	descriptor: TMember,
	handler: IpcHandler<TAddress, RpcParams<TMember>, RpcResult<TMember>>,
): () => void {
	const member = getRpcMember(descriptor);
	return getIpcHandlerChannelBackend<TAddress>(registrationKey).handle(member.method, (address, params) => {
		return addressed
			? (handler as unknown as (address: TAddress, params: unknown) => unknown)(address, params)
			: (handler as unknown as (params: unknown) => unknown)(params);
	});
}

function on<TAddress, TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	addressed: boolean,
	descriptor: TMember,
	listener: IpcNotificationListener<TAddress, NotificationData<TMember>>,
): () => void {
	const member = getNotificationMember(descriptor);
	return getIpcChannelBackend<TAddress>(registrationKey).on(member.method, (address, data) => {
		return addressed
			? (listener as unknown as (address: TAddress, data: unknown) => void | Promise<void>)(address, data)
			: (listener as unknown as (data: unknown) => void | Promise<void>)(data);
	});
}

function getIpcChannelBackend<TAddress>(registrationKey: symbol): IpcChannelBackend<TAddress> {
	return getRegisteredIpcBackend<IpcChannelBackend<TAddress>>(registrationKey);
}

function getIpcAddressedChannelBackend<TAddress>(registrationKey: symbol): IpcAddressedChannelBackend<TAddress> {
	return getRegisteredIpcBackend<IpcAddressedChannelBackend<TAddress>>(registrationKey);
}

function getIpcHandlerChannelBackend<TAddress>(registrationKey: symbol): IpcHandlerChannelBackend<TAddress> {
	return getRegisteredIpcBackend<IpcHandlerChannelBackend<TAddress>>(registrationKey);
}

function getRegisteredIpcBackend<TBackend>(registrationKey: symbol): TBackend {
	const backend = ipcScope[registrationKey] as TBackend | undefined;
	if (!backend) throw new Error("IPC 通道尚未注册当前运行环境实现");
	return backend;
}

function getRpcMember(member: AnyIpcProtocolMember): IpcRpcDefinition<unknown, unknown> {
	if (member.kind !== IpcProtocolMemberKind.Rpc) throw invalidMethodError(member.method);
	return member;
}

function getNotificationMember(member: AnyIpcProtocolMember): IpcNotificationDefinition<unknown> {
	if (member.kind !== IpcProtocolMemberKind.Notification) throw invalidMethodError(member.method);
	return member;
}

function invalidMethodError(method: string): IpcError {
	return new IpcError(IpcErrorCode.MethodNotFound, `IPC 方法不存在或类型不匹配: ${method}`);
}
