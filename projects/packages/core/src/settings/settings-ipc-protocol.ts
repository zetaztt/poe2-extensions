import { defineIpcProtocol, defineNotification, defineRpc } from "../ipc/ipc-protocol";
import type { AnySettingMember, SettingMemberValue } from "./settings-definition";

/**
 * 通用 settings background 按稳定 key 读取单个领域设置所需的信息。
 */
export interface GetSettingParams<TKey extends string = string, TValue = unknown> {
	key: TKey;
	// 通用 background 不依赖领域定义，冷缓存读取需要由调用环境提供该成员的默认值。
	defaultValue: TValue;
}

export interface GetSettingValuesParams {
	// 响应与请求保持相同顺序，调用方据此恢复成员 tuple 的 key/value 类型关系。
	settings: GetSettingParams[];
}

/**
 * 同一 background service worker 生命周期内带 instance/revision 的权威设置快照。
 */
export interface SettingValueSnapshot<TKey extends string = string, TValue = unknown> {
	instanceId: string;
	revision: number;
	key: TKey;
	value: TValue;
}

/**
 * 异步持久化失败通知；snapshot 标识失败写入对应的值和版本，而不是当前最新值。
 */
export interface SettingPersistenceError<TKey extends string = string> {
	instanceId: string;
	revision: number;
	key: TKey;
	message: string;
}

export type SettingMemberSnapshot<TMember extends AnySettingMember> = SettingValueSnapshot<
	TMember["key"],
	SettingMemberValue<TMember>
>;

/**
 * 通用 settings 通知协议；设置写入必须由具名领域 RPC 完成。
 */
export const settingsIpcProtocol = defineIpcProtocol({
	name: "settings",
	get: defineRpc<GetSettingParams, SettingValueSnapshot>(),
	getValues: defineRpc<GetSettingValuesParams, SettingValueSnapshot[]>(),
	onChanged: defineNotification<SettingValueSnapshot>(),
	persistenceFailed: defineNotification<SettingPersistenceError>(),
});
