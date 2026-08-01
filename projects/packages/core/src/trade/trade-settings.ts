import {
	defineSetting,
	defineSettings,
	type SettingsDefinitionMember,
	type SettingsValues,
} from "../settings/settings-definition";

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

export enum SettingsServiceErrorCode {
	None = 0,
	LoadFailed = 1,
	UpdateFailed = 2,
	PersistenceFailed = 3,
}

export type TradeSettings = SettingsValues<typeof tradeSettings>;
