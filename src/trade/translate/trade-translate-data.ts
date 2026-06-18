import { proxy, XhrResponse } from "ajax-hook";
import {
	type TradeFiltersDataResponse,
	type TradeItemsDataResponse,
	type TradeStaticsDataResponse,
	type TradeStatsResponse,
	type Translated,
} from "../trade-types";
import { loadTranslateDictionary, preloadTranslateDictionary, TranslateDictionary } from "../../translate-dictionary";
import { isUniqueItem } from "../trade-utils";

export const tradeDataPaths = {
	items: "/api/trade2/data/items",
	stats: "/api/trade2/data/stats",
	static: "/api/trade2/data/static",
	filters: "/api/trade2/data/filters",
} as const;

export type TradeDataKind = keyof typeof tradeDataPaths;

const tradeDataEntries = Object.entries(tradeDataPaths) as [TradeDataKind, string][];

export function getTradeDataKind(url: string): TradeDataKind | undefined {
	return tradeDataEntries.find(([, path]) => url.endsWith(path))?.[0];
}

export function isTradeDataUrl(url: string): boolean {
	return getTradeDataKind(url) !== undefined;
}

export async function processTradeData(response: XhrResponse) {
	const dictionary = await loadTranslateDictionary();
	const data = JSON.parse(response.response);

	if (!dictionary || !isObject(data)) return data;

	switch (getTradeDataKind(response.config.url)) {
		case "items":
			processItemsData(data as TradeItemsDataResponse, dictionary);
			break;
		case "stats":
			processStatsData(data as TradeStatsResponse, dictionary);
			break;
		case "static":
			processStaticData(data as TradeStaticsDataResponse, dictionary);
			break;
		case "filters":
			processFilterData(data as TradeFiltersDataResponse, dictionary);
			break;
	}

	response.response = JSON.stringify(data);
}

export function processItemsData(data: TradeItemsDataResponse, dictionary: TranslateDictionary): void {
	if (!Array.isArray(data.result)) return;

	for (const group of data.result) {
		group.label = dictionary[group.label] ?? group.label;

		if (!Array.isArray(group.entries)) continue;

		for (const entry of group.entries) {
			let originalText: string;
			let translateText: string | undefined;

			if (isUniqueItem(entry)) {
				const name = dictionary[entry.name];
				const type = dictionary[entry.type];

				if (name || type) {
					const discText = entry.disc === "legacy" ? " (舊版)" : "";
					translateText = `${name ?? entry.name} ${type ?? entry.type}${discText}`;
				}

				originalText = entry.text;
			} else {
				originalText = entry.type;
				translateText = dictionary[entry.type];
			}

			if (translateText) {
				entry.text = `${translateText} [${originalText}]`;
				Object.assign(entry, {
					_translateText: translateText,
					_originalText: originalText,
				} as Translated<{}>);
			}
		}
	}
}

export function processStatsData(data: TradeStatsResponse, dictionary: TranslateDictionary): void {
	if (!Array.isArray(data.result)) return;

	for (const group of data.result) {
		group.label = dictionary[group.label] ?? group.label;

		if (!Array.isArray(group.entries)) continue;

		for (const entry of group.entries) {
			const translateText = dictionary[entry.text];
			const originalText = entry.text;

			if (translateText) {
				entry.text = `${translateText} [${originalText}]`;
				Object.assign(entry, {
					_translateText: translateText,
					_originalText: originalText,
				} as Translated<{}>);
			}
		}
	}
}

export function processStaticData(data: TradeStaticsDataResponse, dictionary: TranslateDictionary): void {
	if (!Array.isArray(data.result)) return;

	for (const group of data.result) {
		group.label = dictionary[group.label] ?? group.label;

		if (!Array.isArray(group.entries)) continue;

		for (const entry of group.entries) {
			entry.text = dictionary[entry.text] ?? entry.text;
		}
	}
}

export function processFilterData(data: TradeFiltersDataResponse, dictionary: TranslateDictionary): void {
	if (!Array.isArray(data.result)) return;

	for (const group of data.result) {
		if (group.title) {
			group.title = dictionary[group.title] ?? group.title;
		}

		if (!Array.isArray(group.filters)) continue;

		for (const entry of group.filters) {
			if (entry.text) {
				entry.text = dictionary[entry.text] ?? entry.text;
			}

			if (entry.tip) {
				entry.tip = dictionary[entry.tip] ?? entry.tip;
			}

			if (entry.option?.options) {
				for (const option of entry.option.options) {
					option.text = dictionary[option.text] ?? option.text;
				}
			}
		}
	}
}

function isObject(value: unknown): value is object {
	return typeof value === "object" && value !== null;
}

export function installTranslateDataHook() {
	proxy({
		//请求发起前进入
		onRequest: (config, handler) => {
			if (isTradeDataUrl(config.url)) {
				preloadTranslateDictionary();
			}

			handler.next(config);
		},
		//请求成功后进入
		onResponse: async (response, handler) => {
			if (isTradeDataUrl(response.config.url)) {
				console.log("处理中文数据", response);
				await processTradeData(response);
			}
			handler.next(response);
		},
	});
}
