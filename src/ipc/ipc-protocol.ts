export enum IpcProtocolMemberKind {
	Rpc = 1,
	Notification = 2,
}

export interface IpcRpcOptions {
	timeoutMs?: number;
}

interface IpcRpcDefinitionBase<TMethod extends string> {
	kind: IpcProtocolMemberKind.Rpc;
	method: TMethod;
	timeoutMs?: number;
}

interface IpcNotificationDefinitionBase<TMethod extends string> {
	kind: IpcProtocolMemberKind.Notification;
	method: TMethod;
}

export type IpcRpcDefinition<TParams, TResult, TMethod extends string = string> = IpcRpcDefinitionBase<TMethod> & {
	readonly _params?: TParams;
	readonly _result?: TResult;
};

export type IpcNotificationDefinition<
	TData,
	TMethod extends string = string,
> = IpcNotificationDefinitionBase<TMethod> & {
	readonly _data?: TData;
};

type UnboundIpcRpcDefinition<TParams, TResult> = Omit<IpcRpcDefinition<TParams, TResult>, "method">;
type UnboundIpcNotificationDefinition<TData> = Omit<IpcNotificationDefinition<TData>, "method">;

export type AnyIpcProtocolMember = IpcRpcDefinition<any, any> | IpcNotificationDefinition<any>;

type AnyUnboundIpcProtocolMember =
	| UnboundIpcRpcDefinition<unknown, unknown>
	| UnboundIpcNotificationDefinition<unknown>;

export type IpcProtocolMembers = Record<string, AnyIpcProtocolMember>;

declare const ipcProtocolMembersType: unique symbol;

export type IpcProtocol<TName extends string = string, TMembers extends IpcProtocolMembers = IpcProtocolMembers> = {
	readonly name: TName;
	readonly [ipcProtocolMembersType]?: TMembers;
} & TMembers;

type BindIpcProtocolMember<TProtocolName extends string, TMemberName extends string, TMember> =
	TMember extends UnboundIpcRpcDefinition<infer TParams, infer TResult>
		? IpcRpcDefinition<TParams, TResult, `${TProtocolName}/${TMemberName}`>
		: TMember extends UnboundIpcNotificationDefinition<infer TData>
			? IpcNotificationDefinition<TData, `${TProtocolName}/${TMemberName}`>
			: never;

type BindIpcProtocolMembers<TProtocolName extends string, TMembers> = {
	[K in keyof TMembers]: BindIpcProtocolMember<TProtocolName, Extract<K, string>, TMembers[K]>;
};

export function defineRpc<TParams, TResult>(options: IpcRpcOptions = {}): UnboundIpcRpcDefinition<TParams, TResult> {
	return {
		kind: IpcProtocolMemberKind.Rpc,
		...options,
	} as UnboundIpcRpcDefinition<TParams, TResult>;
}

export function defineNotification<TData>(): UnboundIpcNotificationDefinition<TData> {
	return {
		kind: IpcProtocolMemberKind.Notification,
	} as UnboundIpcNotificationDefinition<TData>;
}

export function defineIpcProtocol<const TDefinition extends { name: string }>(
	definition: TDefinition,
): IpcProtocol<TDefinition["name"], BindIpcProtocolMembers<TDefinition["name"], Omit<TDefinition, "name">>> {
	const { name, ...unboundMembers } = definition;
	const protocol: Record<string, unknown> = { name };

	for (const [memberName, member] of Object.entries(unboundMembers as Record<string, AnyUnboundIpcProtocolMember>)) {
		protocol[memberName] = {
			...member,
			method: `${name}/${memberName}`,
		};
	}

	return protocol as IpcProtocol<
		TDefinition["name"],
		BindIpcProtocolMembers<TDefinition["name"], Omit<TDefinition, "name">>
	>;
}
