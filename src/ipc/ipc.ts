import { ErrorCodes, ResponseError } from "vscode-jsonrpc/browser";
import type { IpcConnectionHub } from "./ipc-connection-hub";
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
type IpcHandler<TParams, TResult> = (...args: IpcArguments<TParams>) => TResult | Promise<TResult>;
type IpcNotificationListener<TData> = (...args: IpcArguments<TData>) => void | Promise<void>;

interface IpcSender {
	invoke<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		...args: IpcArguments<RpcParams<TMember>>
	): Promise<RpcResult<TMember>>;
	send<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		...args: IpcArguments<NotificationData<TMember>>
	): Promise<void>;
}

const defaultRequestTimeoutMs = 10_000;
const ipcMainRegistrationKey = Symbol.for("poe2-extensions:ipc-main");
const ipcWindowRegistrationKey = Symbol.for("poe2-extensions:ipc-window");
const ipcScope = globalThis as Record<PropertyKey, unknown>;

class IpcChannel<TAddress> {
	public constructor(
		private readonly registrationKey: symbol,
		private readonly defaultAddress: TAddress,
	) {}

	public register(factory: () => IpcConnectionHub<TAddress>): void {
		if (ipcScope[this.registrationKey]) return;

		// main-world 的独立构建产物会重复注册；只有首个 factory 可以创建消息监听和连接。
		ipcScope[this.registrationKey] = factory();
	}

	public invoke<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		...args: IpcArguments<RpcParams<TMember>>
	): Promise<RpcResult<TMember>> {
		return invoke(this.registrationKey, this.defaultAddress, member, args);
	}

	public send<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		...args: IpcArguments<NotificationData<TMember>>
	): Promise<void> {
		return send(this.registrationKey, this.defaultAddress, member, args);
	}

	public handle<TMember extends IpcRpcDefinition<any, any>>(
		member: TMember,
		handler: IpcHandler<RpcParams<TMember>, RpcResult<TMember>>,
	): () => void {
		return handle(this.registrationKey, member, handler);
	}

	public on<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		listener: IpcNotificationListener<NotificationData<TMember>>,
	): () => void {
		return on(this.registrationKey, member, listener);
	}

	protected createSender(address: TAddress): IpcSender {
		return {
			invoke: (member, ...args) => invoke(this.registrationKey, address, member, args),
			send: (member, ...args) => send(this.registrationKey, address, member, args),
		};
	}
}

class IpcMain extends IpcChannel<void> {
	public constructor() {
		super(ipcMainRegistrationKey, undefined);
	}
}

class IpcWindow extends IpcChannel<number | undefined> {
	public constructor() {
		super(ipcWindowRegistrationKey, undefined);
	}

	public to(tabId: number): IpcSender {
		return this.createSender(tabId);
	}
}

export const ipcMain = new IpcMain();
export const ipcWindow = new IpcWindow();

async function invoke<TAddress, TMember extends IpcRpcDefinition<any, any>>(
	registrationKey: symbol,
	address: TAddress,
	descriptor: TMember,
	args: IpcArguments<RpcParams<TMember>>,
): Promise<RpcResult<TMember>> {
	const member = getRpcMember(descriptor);
	const result = await getIpcConnectionHub<TAddress>(registrationKey).invoke(
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
	return getIpcConnectionHub<TAddress>(registrationKey).send(address, member.method, args[0]);
}

function handle<TMember extends IpcRpcDefinition<any, any>>(
	registrationKey: symbol,
	descriptor: TMember,
	handler: IpcHandler<RpcParams<TMember>, RpcResult<TMember>>,
): () => void {
	const member = getRpcMember(descriptor);
	return getIpcConnectionHub<unknown>(registrationKey).handle(member.method, (params) => {
		return (handler as (params: unknown) => unknown)(params);
	});
}

function on<TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	descriptor: TMember,
	listener: IpcNotificationListener<NotificationData<TMember>>,
): () => void {
	const member = getNotificationMember(descriptor);
	return getIpcConnectionHub<unknown>(registrationKey).on(member.method, (data) => {
		return (listener as (data: unknown) => void | Promise<void>)(data);
	});
}

function getIpcConnectionHub<TAddress>(registrationKey: symbol): IpcConnectionHub<TAddress> {
	const hub = ipcScope[registrationKey] as IpcConnectionHub<TAddress> | undefined;
	if (!hub) throw new Error("IPC 通道尚未注册当前运行环境实现");
	return hub;
}

function getRpcMember(member: AnyIpcProtocolMember): IpcRpcDefinition<unknown, unknown> {
	if (member.kind !== IpcProtocolMemberKind.Rpc) throw invalidMethodError(member.method);
	return member;
}

function getNotificationMember(member: AnyIpcProtocolMember): IpcNotificationDefinition<unknown> {
	if (member.kind !== IpcProtocolMemberKind.Notification) throw invalidMethodError(member.method);
	return member;
}

function invalidMethodError(method: string): ResponseError<void> {
	return new ResponseError(ErrorCodes.MethodNotFound, `IPC 方法不存在或类型不匹配: ${method}`);
}
