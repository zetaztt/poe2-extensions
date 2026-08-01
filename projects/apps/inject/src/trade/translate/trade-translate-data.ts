import { proxy, XhrResponse } from "ajax-hook";
import type { TranslateDictionary } from "@poe2-extensions/core/dictionary";
import {
	type TradeFiltersDataResponse,
	type TradeItemsDataResponse,
	type TradeStaticsDataResponse,
	type TradeStatsResponse,
	type Translated,
} from "../trade-types";
import { isUniqueItem } from "../trade-utils";
import { tradeTranslateDictionaryLoader } from "./trade-translate-dictionary-loader";

/**
 * 可翻译的官方 trade2 数据端点；路径匹配刻意不覆盖搜索结果和其他 API。
 */
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

/**
 * 在 XHR response 交给官方页面前原位翻译已识别数据；字典不可用或解析结果非对象时不改写响应。
 */
export async function processTradeData(response: XhrResponse) {
	const dictionary = await tradeTranslateDictionaryLoader.loadDictionarySafely();
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
			// item/stat 可见文本必须同时保留英文原文，避免映射缺失或同名歧义丢失语义。
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
			// 数值模板翻译后继续附带完整英文词条，避免同一 stat 文本产生歧义。
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

/**
 * 安装当前 MAIN world 生命周期唯一的 XHR hook；预请求加载字典以减少 response 阶段等待。
 */
export function installTranslateDataHook() {
	proxy({
		// 请求阶段只预加载字典，不改变官方请求。
		onRequest: (config, handler) => {
			if (isTradeDataUrl(config.url)) {
				tradeTranslateDictionaryLoader.preloadDictionary();
			}

			handler.next(config);
		},
		// 响应阶段仅处理已知 trade2 数据端点，其他 XHR 原样继续。
		onResponse: async (response, handler) => {
			if (isTradeDataUrl(response.config.url)) {
				console.log("处理中文数据", response);
				await processTradeData(response);
			}
			handler.next(response);
		},
	});
}
