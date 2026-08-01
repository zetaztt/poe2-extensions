import type { TradeStatPresetQuery } from "@poe2-extensions/core/trade";

/**
 * XHR hook 附加到官方数据项的翻译元数据；页面仍显示并保留英文原文。
 */
export type Translated<T> = T & {
	_translateText: string;
	_originalText: string;
};

/**
 * 官方 trade2 数据端点的最小消费形状；运行时仍需在处理边界检查数组和对象。
 */
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

/**
 * MAIN world 中官方 Vue 根实例的最小适配形状，不是扩展自身的页面 store。
 */
export interface TradeApp {
	$store: TradeAppStore;
	query?: TradeQueryState;
}

export interface TradeAppStore {
	state: TradeSearchesState;
	commit(type: "pushStatGroup", payload: TradeStatPresetQuery): void;
}

export interface TradeQueryState {
	query?: {
		stats?: TradeStatPresetQuery[];
	};
}

export interface TradeSearch {
	results: TradeSearchResult[];
}

export interface TradeSearchResult {
	items: Record<string, TradeSearchResultEntry>;
}

export interface TradeSearchResultEntry {
	item: TradeSearchItem;
}

/**
 * 官方搜索结果物品的宽松读取模型；可选字段反映联盟和物品类别差异。
 */
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
	sockets?: TradeSearchItemSocket[];
	socketedItems?: TradeSearchSocketedItem[];
	notableProperties?: TradeSearchItemNotableProperty[];
	implicitMods?: string[];
	runeMods?: string[];
	enchantMods?: string[];
	fracturedMods?: string[];
	explicitMods?: string[];
	desecratedMods?: string[];
	mutatedMods?: string[];
	corrupted?: boolean;
	unmetRequirements?: string[];
	augmentedInfo?: string;
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

export interface TradeSearchItemSocket {
	group?: number;
	attr?: string;
	sColour?: string;
}

export interface TradeSearchSocketedItem {
	frameType?: number;
	baseType?: string;
}

export interface TradeSearchItemNotableProperty {
	name: string;
}

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

/**
 * 官方 api-plugins hook 的最小适配契约，仅用于读取当前页面响应。
 */
export interface ApiPluginsHookOptions {
	on: "response";
	hook: (response: Response) => void;
}

export interface ApiPlugin {
	hook(options: ApiPluginsHookOptions): void;
}

export interface PoePlugins {
	getPlugin(name: "api-plugins", value: ApiPlugin): ApiPlugin;
	getPlugin(name: string, value: unknown): unknown;
}

declare global {
	interface Window {
		poePlugins: PoePlugins;
		app?: TradeApp;
	}
}
