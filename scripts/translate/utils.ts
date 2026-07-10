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

export const textsPath = defaultTradeTranslatePoPath;

export function readTexts(): Record<string, TextData> {
	return readTradeTranslateTextItemsFromPo(textsPath);
}

export function writeTexts(texts: TextData[]): void {
	writeTradeTranslateTextItemsToPo(texts, textsPath);
}
