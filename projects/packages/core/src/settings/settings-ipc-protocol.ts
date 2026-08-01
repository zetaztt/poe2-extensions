import { defineIpcProtocol, defineNotification, defineRpc } from "../ipc/ipc-protocol";
import type { AnySettingMember, SettingMemberValue } from "./settings-definition";

export interface GetSettingParams<TKey extends string = string, TValue = unknown> {
	key: TKey;
	// 通用 background 不依赖领域定义，冷缓存读取需要由调用环境提供该成员的默认值。
	defaultValue: TValue;
}

export interface GetSettingValuesParams {
	// 响应与请求保持相同顺序，调用方据此恢复成员 tuple 的 key/value 类型关系。
	settings: GetSettingParams[];
}

export interface SettingValueSnapshot<TKey extends string = string, TValue = unknown> {
	instanceId: string;
	revision: number;
	key: TKey;
	value: TValue;
}

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

export const settingsIpcProtocol = defineIpcProtocol({
	name: "settings",
	get: defineRpc<GetSettingParams, SettingValueSnapshot>(),
	getValues: defineRpc<GetSettingValuesParams, SettingValueSnapshot[]>(),
	onChanged: defineNotification<SettingValueSnapshot>(),
	persistenceFailed: defineNotification<SettingPersistenceError>(),
});
