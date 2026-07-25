import fs from "node:fs";
import PO from "pofile";

import { getTradeTranslateTextItemKey, type TradeTranslateTextItem } from "./text-data";

export const defaultTradeTranslatePoPath = "./data/trade-texts.po";

export function readTradeTranslateTextItemsFromPo(
	textsPath = defaultTradeTranslatePoPath,
): Record<string, TradeTranslateTextItem> {
	if (!fs.existsSync(textsPath)) {
		return {};
	}

	const po = PO.parse(fs.readFileSync(textsPath, { encoding: "utf8" }));
	const texts: Record<string, TradeTranslateTextItem> = {};

	for (const item of po.items) {
		const key = getTradeTranslateTextItemKey(item);
		if (!key) {
			continue;
		}
		texts[key] = item;
	}

	return texts;
}

export function writeTradeTranslateTextItemsToPo(
	texts: TradeTranslateTextItem[],
	textsPath = defaultTradeTranslatePoPath,
): void {
	texts.sort((a, b) => (getTradeTranslateTextItemKey(a) ?? "").localeCompare(getTradeTranslateTextItemKey(b) ?? ""));
	fs.writeFileSync(textsPath, createTradeTranslatePo(texts).toString());
}

function createTradeTranslatePo(texts: TradeTranslateTextItem[]): PO {
	const po = new PO();
	po.comments = ["POE2 trade translation texts"];
	po.headers = {
		"Content-Type": "text/plain; charset=UTF-8",
	};

	for (const text of texts) {
		po.items.push(text);
	}

	return po;
}
