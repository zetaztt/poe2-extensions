import { defaultTradeTextsPath, readTextsFromPo, writeTextsToPo, type TextData } from "zeta-poe2-trade-translate-tools";

export {
	createTextItem,
	getTextKey,
	getTextOriginal,
	getTextSource,
	getTextTranslate,
	setTextSource,
	setTextTranslate,
	type TextData,
	type TranslateSource,
} from "zeta-poe2-trade-translate-tools";

export const textsPath = defaultTradeTextsPath;

export function readTexts(): Record<string, TextData> {
	return readTextsFromPo(textsPath);
}

export function writeTexts(texts: TextData[]): void {
	writeTextsToPo(texts, textsPath);
}
