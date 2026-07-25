export interface TradeStatPreset {
	name: string;
	query: TradeStatPresetQuery;
}

export type TradeStatPresetQuery = Record<string, unknown>;
