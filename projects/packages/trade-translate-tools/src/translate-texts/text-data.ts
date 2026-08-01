import PO from "pofile";

export type TradeTranslateSource = string;
export type TradeTranslateTextItem = InstanceType<typeof PO.Item>;

const sourceCommentPattern = /^source:\s*(\S.*)$/;

/**
 * 创建以 msgctxt 为稳定 key 的 PO 条目，空翻译仍写为合法的单元素 msgstr。
 */
export function createTradeTranslateTextItem(
	key: string,
	original: string,
	translate?: string,
): TradeTranslateTextItem {
	const item = new PO.Item();
	item.msgctxt = key;
	item.msgid = original;
	setTradeTranslateTextItemTranslation(item, translate);
	return item;
}

export function getTradeTranslateTextItemKey(item: TradeTranslateTextItem): string | undefined {
	return item.msgctxt || undefined;
}

export function getTradeTranslateTextItemOriginal(item: TradeTranslateTextItem): string {
	return item.msgid;
}

export function getTradeTranslateTextItemTranslation(item: TradeTranslateTextItem): string | undefined {
	return item.msgstr[0] || undefined;
}

export function setTradeTranslateTextItemTranslation(
	item: TradeTranslateTextItem,
	translate: string | undefined,
): void {
	item.msgstr = [translate ?? ""];
}

/**
 * 从提取注释读取上游来源标记；其他人工注释保持不变。
 */
export function getTradeTranslateTextItemSource(item: TradeTranslateTextItem): TradeTranslateSource | undefined {
	const comments = item.extractedComments ?? [];
	for (const comment of comments) {
		const sourceMatch = sourceCommentPattern.exec(comment);
		if (sourceMatch) {
			return sourceMatch[1];
		}
	}
	return undefined;
}

/**
 * 替换唯一的 source 提取注释，同时保留条目上的其他提取注释。
 */
export function setTradeTranslateTextItemSource(
	item: TradeTranslateTextItem,
	source: TradeTranslateSource | undefined,
): void {
	const comments = item.extractedComments ?? [];
	item.extractedComments = comments.filter((comment) => !sourceCommentPattern.test(comment));
	if (source) {
		item.extractedComments.push(`source: ${source}`);
	}
}
