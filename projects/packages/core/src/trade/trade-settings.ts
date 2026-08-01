import {
	defineSetting,
	defineSettings,
	type SettingsDefinitionMember,
	type SettingsValues,
} from "../settings/settings-definition";

/**
 * trade 功能设置定义；生成的 member key 是 IPC 与 storage.sync 的稳定标识。
 */
export const tradeSettings = /* @__PURE__ */ defineSettings({
	name: "trade",
	translate: defineSetting({
		defaultValue: false,
	}),
	itemCopy: defineSetting({
		defaultValue: false,
	}),
	statPreset: defineSetting({
		defaultValue: false,
	}),
});

export type TradeSetting = SettingsDefinitionMember<typeof tradeSettings>;
export type TradeSettingKey = TradeSetting["key"];

/**
 * 页面 service/store 使用的稳定错误分类，不在协议值中携带 UI 文案。
 */
export enum SettingsServiceErrorCode {
	None = 0,
	LoadFailed = 1,
	UpdateFailed = 2,
	PersistenceFailed = 3,
}

export type TradeSettings = SettingsValues<typeof tradeSettings>;
