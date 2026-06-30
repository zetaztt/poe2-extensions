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
	backfilled?: boolean;
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

function getBackfilled(comments: string[]): boolean {
	return comments.some((comment) => /^source:\s*backfill$/.test(comment));
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
		const comments: string[] = [];
		if (text.backfilled) {
			comments.push("source: backfill");
		} else if (text.source) {
			comments.push(`source: ${text.source}`);
		}
		item.extractedComments = comments;
		po.items.push(item);
	}

	return po;
}

function writePo(path: string, texts: TextData[]): void {
	texts.sort((a, b) => a.key.localeCompare(b.key));
	fs.writeFileSync(path, createPo(texts).toString());
}

function preserveBackfillMarkers(beforeTexts: Record<string, TextData>, afterTexts: TextData[]): TextData[] {
	return afterTexts.map((text) => {
		const beforeText = beforeTexts[text.key];
		if (
			beforeText?.backfilled
			&& beforeText.original === text.original
			&& beforeText.translate === text.translate
		) {
			return { ...text, source: "backfill", backfilled: true };
		}
		return { ...text, backfilled: undefined };
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
		`backfilled=${text.backfilled ? "true" : "false"}`,
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
		if (!!beforeText.backfilled !== !!text.backfilled) {
			changes.push(
				`backfilled ${beforeText.backfilled ? "true" : "false"} -> ${text.backfilled ? "true" : "false"}`,
			);
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
			backfilled: getBackfilled(item.extractedComments),
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
				backfilled: false,
			};
		}),
	);
}

export function updatePoTextsByKey(
	updates: Record<string, { translate: string; source: TranslateSource; backfilled?: boolean }>,
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
			backfilled: update.backfilled,
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
			backfilled: false,
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
