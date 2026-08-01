import fs from "node:fs";
import PO from "pofile";

import { getTradeTranslateTextItemKey, type TradeTranslateTextItem } from "./text-data";

/**
 * 人工维护翻译源的默认仓库相对路径。
 */
export const defaultTradeTranslatePoPath = "./data/trade-texts.po";

/**
 * 读取 PO 并按稳定 msgctxt 建索引；缺失 key 的条目不进入脚本合并流程。
 */
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

/**
 * 将完整条目集合按稳定 key 排序后重写 PO；该函数会原位排序传入数组。
 */
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
