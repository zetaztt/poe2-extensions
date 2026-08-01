import {
	createTradeTranslateTextItem,
	defaultTradeTranslatePoPath,
	getTradeTranslateTextItemKey,
	getTradeTranslateTextItemOriginal,
	getTradeTranslateTextItemSource,
	getTradeTranslateTextItemTranslation,
	readTradeTranslateTextItemsFromPo,
	setTradeTranslateTextItemSource,
	setTradeTranslateTextItemTranslation,
	writeTradeTranslateTextItemsToPo,
	type TradeTranslateSource,
	type TradeTranslateTextItem,
} from "zeta-poe2-trade-translate-tools/translate-texts";

export type TextData = TradeTranslateTextItem;
export type TranslateSource = TradeTranslateSource;

export const createTextItem = createTradeTranslateTextItem;
export const getTextKey = getTradeTranslateTextItemKey;
export const getTextOriginal = getTradeTranslateTextItemOriginal;
export const getTextSource = getTradeTranslateTextItemSource;
export const getTextTranslate = getTradeTranslateTextItemTranslation;
export const setTextSource = setTradeTranslateTextItemSource;
export const setTextTranslate = setTradeTranslateTextItemTranslation;

/**
 * 人工维护 PO 源的兼容入口；脚本通过源码包实现统一的字段和注释处理。
 */
export const textsPath = defaultTradeTranslatePoPath;

/**
 * 按稳定 msgctxt key 读取人工维护的翻译源。
 */
export function readTexts(): Record<string, TextData> {
	return readTradeTranslateTextItemsFromPo(textsPath);
}

/**
 * 重写人工维护的 PO 源；调用方必须传入已经完成合并的完整条目集合。
 */
export function writeTexts(texts: TextData[]): void {
	writeTradeTranslateTextItemsToPo(texts, textsPath);
}
