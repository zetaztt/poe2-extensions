export {
	createTradeTranslateTextItem,
	getTradeTranslateTextItemKey,
	getTradeTranslateTextItemOriginal,
	getTradeTranslateTextItemSource,
	getTradeTranslateTextItemTranslation,
	setTradeTranslateTextItemSource,
	setTradeTranslateTextItemTranslation,
	type TradeTranslateSource,
	type TradeTranslateTextItem,
} from "./text-data";

export {
	defaultTradeTranslatePoPath,
	readTradeTranslateTextItemsFromPo,
	writeTradeTranslateTextItemsToPo,
} from "./po-file";
