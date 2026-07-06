import fs from "node:fs";
import PO from "pofile";

export const textsPath = "./data/trade-texts.po";

export type TranslateSource = string;

export type TextData = InstanceType<typeof PO.Item>;

const sourceCommentPattern = /^source:\s*(\S.*)$/;

export function createTextItem(key: string, original: string, translate?: string): TextData {
	const item = new PO.Item();
	item.msgctxt = key;
	item.msgid = original;
	setTextTranslate(item, translate);
	return item;
}

export function getTextKey(item: TextData): string | undefined {
	return item.msgctxt || undefined;
}

export function getTextOriginal(item: TextData): string {
	return item.msgid;
}

export function getTextTranslate(item: TextData): string | undefined {
	return item.msgstr[0] || undefined;
}

export function setTextTranslate(item: TextData, translate: string | undefined): void {
	item.msgstr = [translate ?? ""];
}

export function getTextSource(item: TextData): TranslateSource | undefined {
	const comments = item.extractedComments ?? [];
	for (const comment of comments) {
		const sourceMatch = sourceCommentPattern.exec(comment);
		if (sourceMatch) {
			return sourceMatch[1];
		}
	}
	return undefined;
}

export function setTextSource(item: TextData, source: TranslateSource | undefined): void {
	const comments = item.extractedComments ?? [];
	item.extractedComments = comments.filter((comment) => !sourceCommentPattern.test(comment));
	if (source) {
		item.extractedComments.push(`source: ${source}`);
	}
}

function createPo(texts: TextData[]): PO {
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

export function readTexts(): Record<string, TextData> {
	if (!fs.existsSync(textsPath)) {
		return {};
	}

	const po = PO.parse(fs.readFileSync(textsPath, { encoding: "utf8" }));
	const texts: Record<string, TextData> = {};

	for (const item of po.items) {
		const key = getTextKey(item);
		if (!key) {
			continue;
		}
		texts[key] = item;
	}

	return texts;
}

export function writeTexts(texts: TextData[]) {
	texts.sort((a, b) => (getTextKey(a) ?? "").localeCompare(getTextKey(b) ?? ""));
	fs.writeFileSync(textsPath, createPo(texts).toString());
}
