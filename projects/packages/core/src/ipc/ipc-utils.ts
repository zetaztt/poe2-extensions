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

export const defaultRequestTimeoutMs = 10_000;

export function getRpcMember(member: AnyIpcProtocolMember): IpcRpcDefinition<unknown, unknown> {
	if (member.kind !== IpcProtocolMemberKind.Rpc) throw invalidMethodError(member.method);
	return member;
}

function invalidMethodError(method: string): IpcError {
	return new IpcError(IpcErrorCode.MethodNotFound, `IPC 方法不存在或类型不匹配: ${method}`);
}

export function getNotificationMember(member: AnyIpcProtocolMember): IpcNotificationDefinition<unknown> {
	if (member.kind !== IpcProtocolMemberKind.Notification) throw invalidMethodError(member.method);
	return member;
}
