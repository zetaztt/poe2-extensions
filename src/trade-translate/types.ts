export type Translated<T> = T & {
	_translateText: string;
	_originalText: string;
};

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

export interface ApiPluginsHookOptions {
	on: "response",
	hook: (response: Response) => void;
}

export interface ApiPlugin {
	hook(options: ApiPluginsHookOptions): void;
}

export interface PoePlugins {
	getPlugin(name: 'api-plugins', value: ApiPlugin): ApiPlugin;
	getPlugin(name: string, value: unknown): unknown;
}

declare global {
	interface Window {
		poePlugins: PoePlugins;
	}
}

export function isUniqueItem(item: TradeItemConfig): item is TradeItemUniqueConfig {
	return Boolean('flags' in item && item.flags.unique);
}

