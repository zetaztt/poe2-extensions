export enum TradeSetting {
	Translate = 1,
	ItemCopy = 2,
	StatPreset = 3,
}

export interface TradeSettings {
	translateEnabled: boolean;
	itemCopyEnabled: boolean;
	statPresetEnabled: boolean;
}

export interface TradeSettingsSnapshot {
	instanceId: string;
	revision: number;
	settings: TradeSettings;
}

export interface UpdateTradeSettingParams {
	setting: TradeSetting;
	enabled: boolean;
}

export interface TradeSettingsUpdateResult extends TradeSettingsSnapshot {
	activeTradeTabUpdated: boolean;
}
