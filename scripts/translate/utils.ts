import fs from "node:fs";
import PO from "pofile";

export const textsPath = "./data/trade-texts.po";
export const translateChangeLogPaths = {
	"pull-translate": "./tmp/pull-translate-changes.log",
	"auto-translate": "./tmp/auto-translate-changes.log",
} as const;

export type TranslateChangeLogSource = keyof typeof translateChangeLogPaths;

export type TranslateSource = "official" | "manual" | "auto" | "backfill";

export interface TextData {
	key: string;
	original: string;
	translate: string | undefined;
	source?: TranslateSource;
}

function getSource(comments: string[]): TranslateSource | undefined {
	for (const comment of comments) {
		const sourceMatch = /^source:\s*(official|manual|auto|backfill)$/.exec(comment);
		if (sourceMatch) {
			return sourceMatch[1] as TranslateSource;
		}
	}
	return undefined;
}

function createPo(texts: TextData[]): PO {
	const po = new PO();
	po.comments = ["POE2 trade translation texts"];
	po.headers = {
		"Content-Type": "text/plain; charset=UTF-8",
	};

	for (const text of texts) {
		const item = new PO.Item();
		item.msgctxt = text.key;
		item.msgid = text.original;
		item.msgstr = [text.translate ?? ""];
		item.extractedComments = text.source ? [`source: ${text.source}`] : [];
		po.items.push(item);
	}

	return po;
}

function mergePoMultilineStrings(content: string): string {
	const lines = content.split("\n");
	const mergedLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		let line = lines[i]!;
		const match = /^(msgctxt|msgid|msgid_plural|msgstr(?:\[\d+\])?) ""$/.exec(line);
		if (!match) {
			mergedLines.push(line);
			continue;
		}

		const parts: string[] = [];
		while (i + 1 < lines.length) {
			const partMatch = /^"(.*)"$/.exec(lines[i + 1]!);
			if (!partMatch || partMatch[1]!.endsWith("\\n")) {
				break;
			}
			parts.push(partMatch[1]!);
			i++;
		}

		if (!parts.length) {
			mergedLines.push(line);
			continue;
		}

		mergedLines.push(`${match[1]} "${parts.join("")}"`);
	}

	return mergedLines.join("\n");
}

function writePo(path: string, texts: TextData[]): void {
	texts.sort((a, b) => a.key.localeCompare(b.key));
	fs.writeFileSync(path, mergePoMultilineStrings(createPo(texts).toString()));
}

function preserveBackfillMarkers(beforeTexts: Record<string, TextData>, afterTexts: TextData[]): TextData[] {
	return afterTexts.map((text) => {
		const beforeText = beforeTexts[text.key];
		if (
			beforeText?.source === "backfill"
			&& beforeText.original === text.original
			&& beforeText.translate === text.translate
		) {
			return { ...text, source: "backfill" };
		}
		return text;
	});
}

function formatLogText(text: string | undefined): string {
	return text ? `"${text}"` : "(empty)";
}

function formatTextSummary(text: TextData): string {
	return [
		`original=${formatLogText(text.original)}`,
		`translate=${formatLogText(text.translate)}`,
		`source=${text.source ?? "(none)"}`,
	].join(", ");
}

export function clearTranslateChangesLog(source: TranslateChangeLogSource): void {
	fs.mkdirSync("./tmp", { recursive: true });
	fs.writeFileSync(translateChangeLogPaths[source], "");
}

export function writeTranslateChangeLogs(source: TranslateChangeLogSource, logs: string[]): void {
	if (!logs.length) {
		return;
	}

	const logPath = translateChangeLogPaths[source];
	fs.mkdirSync("./tmp", { recursive: true });
	fs.appendFileSync(logPath, logs.map((log) => `[${source}] ${log}`).join("\n") + "\n");
	console.log(`[${source}] ${logs.length} text changes logged to ${logPath}`);
}

function logTextChanges(
	source: TranslateChangeLogSource,
	beforeTexts: Record<string, TextData>,
	afterTexts: TextData[],
): void {
	const afterTextsMap = new Map(afterTexts.map((text) => [text.key, text]));
	const logs: string[] = [];

	for (const text of afterTexts) {
		const beforeText = beforeTexts[text.key];
		if (!beforeText) {
			logs.push(`text added: ${text.key}, ${formatTextSummary(text)}`);
			continue;
		}

		const changes: string[] = [];
		if (beforeText.original !== text.original) {
			changes.push(`original ${formatLogText(beforeText.original)} -> ${formatLogText(text.original)}`);
		}
		if (beforeText.translate !== text.translate) {
			changes.push(`translate ${formatLogText(beforeText.translate)} -> ${formatLogText(text.translate)}`);
		}
		if (beforeText.source !== text.source) {
			changes.push(`source ${beforeText.source ?? "(none)"} -> ${text.source ?? "(none)"}`);
		}

		if (changes.length) {
			logs.push(`text changed: ${text.key}, ${changes.join(", ")}`);
		}
	}

	for (const text of Object.values(beforeTexts)) {
		if (!afterTextsMap.has(text.key)) {
			logs.push(`text removed: ${text.key}, ${formatTextSummary(text)}`);
		}
	}

	writeTranslateChangeLogs(source, logs);
}

export function readTexts(): Record<string, TextData> {
	if (!fs.existsSync(textsPath)) {
		return {};
	}

	const po = PO.parse(fs.readFileSync(textsPath, { encoding: "utf8" }));
	const texts: Record<string, TextData> = {};

	for (const item of po.items) {
		if (!item.msgctxt) {
			continue;
		}
		texts[item.msgctxt] = {
			key: item.msgctxt,
			original: item.msgid,
			translate: item.msgstr[0] || undefined,
			source: getSource(item.extractedComments),
		};
	}

	return texts;
}

export function readAutoTranslateTexts(): Record<string, string> {
	const autoTranslateTexts: Record<string, string> = {};

	for (const text of Object.values(readTexts())) {
		if (text.source === "auto" && text.translate) {
			autoTranslateTexts[text.original] = text.translate;
		}
	}

	return autoTranslateTexts;
}

export function readManualTranslateTexts(): Record<string, string> {
	const manualTranslateTexts: Record<string, string> = {};

	for (const text of Object.values(readTexts())) {
		if (text.source === "manual" && text.translate) {
			manualTranslateTexts[text.original] = text.translate;
		}
	}

	return manualTranslateTexts;
}

export function mergeTranslateTexts(
	texts: TextData[],
	manualTranslateTexts = readManualTranslateTexts(),
	autoTranslateTexts = readAutoTranslateTexts(),
): TextData[] {
	return texts.map((text) => {
		const manualTranslate = manualTranslateTexts[text.original];
		if (manualTranslate) {
			return { ...text, translate: manualTranslate, source: "manual" };
		}

		if (text.translate) {
			return { ...text, source: "official" };
		}

		const autoTranslate = autoTranslateTexts[text.original];
		if (autoTranslate) {
			return { ...text, translate: autoTranslate, source: "auto" };
		}

		return { ...text, translate: undefined, source: undefined };
	});
}

export function writeTexts(texts: TextData[]) {
	const beforeTexts = readTexts();
	const mergedTexts = preserveBackfillMarkers(beforeTexts, mergeTranslateTexts(texts));
	logTextChanges("pull-translate", beforeTexts, mergedTexts);
	writePo(textsPath, mergedTexts);
}

export function writeNeedCheckTexts(texts: TextData[]) {
	writeTranslateChangeLogs(
		"pull-translate",
		texts.map((text) => `need check: ${text.key}, ${formatTextSummary(text)}`),
	);
}

export function updatePoTranslateTexts(updates: Record<string, { translate: string; source: TranslateSource }>) {
	writePo(
		textsPath,
		Object.values(readTexts()).map((text) => {
			const update = updates[text.original];
			if (!update) {
				return text;
			}
			return {
				...text,
				translate: update.translate,
				source: update.source,
			};
		}),
	);
}

export function updatePoTextsByKey(
	updates: Record<string, { translate: string; source: TranslateSource }>,
	logSource?: TranslateChangeLogSource,
) {
	const beforeTexts = readTexts();
	const updatedTexts = Object.values(beforeTexts).map((text) => {
		const update = updates[text.key];
		if (!update) {
			return text;
		}
		return {
			...text,
			translate: update.translate,
			source: update.source,
		};
	});
	if (logSource) {
		logTextChanges(logSource, beforeTexts, updatedTexts);
	}
	writePo(textsPath, updatedTexts);
}

export function writeAutoTranslateTexts(texts: [string, string][]) {
	const beforeTexts = readTexts();
	const updates = Object.fromEntries(
		texts.map(([original, translate]) => [original, { translate, source: "auto" }] as const),
	);
	const updatedTexts = Object.values(beforeTexts).map((text) => {
		const update = updates[text.original];
		if (!update) {
			return text;
		}
		return {
			...text,
			translate: update.translate,
			source: update.source,
		};
	});
	logTextChanges("auto-translate", beforeTexts, updatedTexts);
	writePo(textsPath, updatedTexts);
}

export function writeManualTranslateTexts(texts: [string, string][]) {
	updatePoTranslateTexts(
		Object.fromEntries(texts.map(([original, translate]) => [original, { translate, source: "manual" }] as const)),
	);
}
