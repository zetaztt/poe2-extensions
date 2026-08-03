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
} from "../ipc-utils";
import type { IpcNotificationDefinition, IpcRpcDefinition } from "../ipc-protocol";

type IpcNotificationListener<TAddress, TData> = (
	address: TAddress,
	...args: IpcArguments<TData>
) => void | Promise<void>;

/**
 * 以 address 定向调用和发送，并保留 notification 实际来源的 channel backend 契约。
 */
export interface IpcAddressedChannelBackend<TAddress> {
	invoke(address: TAddress, method: string, params: unknown | undefined, timeoutMs: number): Promise<unknown>;
	send(address: TAddress, method: string, data: unknown | undefined): Promise<void>;
	on(method: string, handler: (address: TAddress, data: unknown) => void | Promise<void>): () => void;
}

/**
 * 将具名 protocol member 映射到以 address 定向调用的连接 Hub。
 * 构造时按稳定 key 首次注册当前运行环境的 Hub。
 */
export class IpcAddressedChannel<TAddress> {
	public constructor(
		protected readonly registrationKey: symbol,
		factory: () => IpcAddressedChannelBackend<TAddress>,
	) {
		registerIpcBackend(registrationKey, factory);
	}

	public invoke<TMember extends IpcRpcDefinition<any, any>>(
		address: TAddress,
		member: TMember,
		...args: IpcArguments<RpcParams<TMember>>
	): Promise<RpcResult<TMember>> {
		return invoke(this.registrationKey, address, member, args[0]);
	}

	public send<TMember extends IpcNotificationDefinition<any>>(
		address: TAddress,
		member: TMember,
		...args: IpcArguments<NotificationData<TMember>>
	): Promise<void> {
		return send(this.registrationKey, address, member, args[0]);
	}

	/**
	 * 监听所有来源 notification，并将实际来源 address 作为首参传给 listener。
	 */
	public on<TMember extends IpcNotificationDefinition<any>>(
		member: TMember,
		listener: IpcNotificationListener<TAddress, NotificationData<TMember>>,
	): () => void {
		return on(this.registrationKey, member, listener);
	}
}

async function invoke<TAddress, TMember extends IpcRpcDefinition<any, any>>(
	registrationKey: symbol,
	address: TAddress,
	descriptor: TMember,
	params: unknown | undefined,
): Promise<RpcResult<TMember>> {
	const member = getRpcMember(descriptor);
	const result = await getBackend<TAddress>(registrationKey).invoke(
		address,
		member.method,
		params,
		member.timeoutMs ?? defaultRequestTimeoutMs,
	);
	return result as RpcResult<TMember>;
}

function send<TAddress, TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	address: TAddress,
	descriptor: TMember,
	data: unknown | undefined,
): Promise<void> {
	const member = getNotificationMember(descriptor);
	return getBackend<TAddress>(registrationKey).send(address, member.method, data);
}

function on<TAddress, TMember extends IpcNotificationDefinition<any>>(
	registrationKey: symbol,
	descriptor: TMember,
	listener: IpcNotificationListener<TAddress, NotificationData<TMember>>,
): () => void {
	const member = getNotificationMember(descriptor);
	return getBackend<TAddress>(registrationKey).on(member.method, (address, data) =>
		(listener as unknown as (address: TAddress, data: unknown) => void | Promise<void>)(address, data),
	);
}

function getBackend<TAddress>(registrationKey: symbol): IpcAddressedChannelBackend<TAddress> {
	return getRegisteredIpcBackend<IpcAddressedChannelBackend<TAddress>>(registrationKey);
}
