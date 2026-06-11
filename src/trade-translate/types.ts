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

export interface TradeSearchesState {
	transient: {
		searches: TradeSearch[];
	};
}

export interface TradeApp {
	$store: TradeAppStore;
}

export interface TradeAppStore {
	state: TradeSearchesState;
}

export interface TradeSearch {
	results: TradeSearchResult[];
}

export interface TradeSearchResult {
	items: Record<string, TradeSearchResultEntry>;
}

export interface TradeSearchResultEntry {
	id: string;
	listing: TradeSearchListing;
	item: TradeSearchItem;
}

export interface TradeSearchListing {
	method?: string;
	indexed?: string;
	stash?: {
		name?: string;
		x?: number;
		y?: number;
	};
	price?: {
		type?: string;
		amount?: number;
		currency?: string;
	};
	fee?: number;
	account?: {
		name?: string;
		online?: null;
	};
	hideout_token?: string;
}

export interface TradeSearchItem {
	realm?: string;
	verified?: boolean;
	w?: number;
	h?: number;
	icon?: string;
	iconTierText?: string;
	league?: string;
	id: string;
	name?: string;
	typeLine?: string;
	baseType?: string;
	rarity?: string;
	ilvl?: number;
	identified?: boolean;
	note?: string;
	properties?: TradeSearchItemProperty[];
	explicitMods?: string[];
	descrText?: string;
	frameType?: number;
	frameTypeId?: string;
	extended?: TradeSearchItemExtended;
}

export interface TradeSearchItemProperty {
	name: string;
	values?: TradeSearchItemPropertyValue[];
	displayMode?: number;
	type?: number;
}

export type TradeSearchItemPropertyValue = [string, number];

export interface TradeSearchItemExtended {
	mods?: Record<string, TradeSearchItemMod[]>;
	hashes?: Record<string, TradeSearchItemHash[]>;
}

export interface TradeSearchItemMod {
	name?: string;
	tier?: string;
	level?: number;
	magnitudes?: TradeSearchItemModMagnitude[];
}

export interface TradeSearchItemModMagnitude {
	hash?: string;
	min?: string;
	max?: string;
}

export type TradeSearchItemHash = [string, number[]];

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
		app?: TradeApp;
	}
}

export function isUniqueItem(item: TradeItemConfig): item is TradeItemUniqueConfig {
	return Boolean('flags' in item && item.flags.unique);
}
