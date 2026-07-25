import PO from "pofile";

export type TradeTranslateSource = string;
export type TradeTranslateTextItem = InstanceType<typeof PO.Item>;

const sourceCommentPattern = /^source:\s*(\S.*)$/;

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
