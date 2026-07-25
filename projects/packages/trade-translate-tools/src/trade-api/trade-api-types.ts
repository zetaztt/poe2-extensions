export type TradeDataKind = "items" | "stats" | "static" | "filters";

export interface TradeItemBaseConfig {
	type: string;
	text?: string;
}

export interface TradeItemUniqueConfig {
	type: string;
	text: string;
	name: string;
	disc?: string;
	flags: { unique: true };
}

export type TradeItemConfig = TradeItemBaseConfig | TradeItemUniqueConfig;

export interface TradeItemsGroup {
	id: string;
	label: string;
	entries: TradeItemConfig[];
}

export interface TradeItemsDataResponse {
	result: TradeItemsGroup[];
}

export interface TradeStatConfig {
	id: string;
	type: string;
	text: string;
}

export interface TradeStatsGroup {
	id: string;
	label: string;
	entries: TradeStatConfig[];
}

export interface TradeStatsResponse {
	result: TradeStatsGroup[];
}

export interface TradeStaticConfig {
	id: string;
	text: string;
	image?: string;
}

export interface TradeStaticsGroup {
	id: string;
	label: string;
	entries: TradeStaticConfig[];
}

export interface TradeStaticsDataResponse {
	result: TradeStaticsGroup[];
}

export interface FilterConfig {
	id: string;
	option?: {
		options: { id: string | null; text: string }[];
	};
	text?: string;
	fullSpan?: boolean;
	minMax?: boolean;
	halfSpan?: boolean;
	tip?: string;
	image?: string;
	input?: {
		placeholder: string;
	};
}

export interface TradeFiltersGroup {
	id: string;
	title?: string;
	hide?: boolean;
	filters: FilterConfig[];
}

export interface TradeFiltersDataResponse {
	result: TradeFiltersGroup[];
}
