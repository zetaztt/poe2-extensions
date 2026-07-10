import fs from "node:fs";

import { getTextKey, getTextOriginal, getTextTranslate, type TextData } from "./utils";

export {
	type TradeFiltersDataResponse,
	type TradeItemsDataResponse,
	type TradeStaticsDataResponse,
	type TradeStatsResponse,
} from "zeta-poe2-trade-translate-tools/trade-api";

export const poe2Href = "www.pathofexile.com";
export const poe2TwHref = "www.pathofexile.tw";

export const pullTranslateChangeLogPath = "./tmp/pull-translate-changes.log";

const pullTranslateLogPrefix = "pull-translate";

export function logPullTranslate(message: string): void {
	console.log(`[${pullTranslateLogPrefix}] ${message}`);
}

export function clearTranslateChangesLog(logPath: string): void {
	fs.mkdirSync("./tmp", { recursive: true });
	fs.writeFileSync(logPath, "");
}

export function appendTranslateChangeLog(logPath: string, log: string): void {
	const message = `[${pullTranslateLogPrefix}] ${log}`;
	fs.mkdirSync("./tmp", { recursive: true });
	fs.appendFileSync(logPath, `${message}\n`);
	console.log(message);
}

export function formatLogText(text: string | undefined): string {
	return text ? `"${text}"` : "(empty)";
}

export function formatTextSummary(text: TextData): string {
	return [
		`original=${formatLogText(getTextOriginal(text))}`,
		`translate=${formatLogText(getTextTranslate(text))}`,
	].join(", ");
}

export function writeTranslateChangeLogs(logPath: string, logs: string[]): void {
	if (!logs.length) {
		return;
	}

	for (const log of logs) {
		appendTranslateChangeLog(logPath, log);
	}
	logPullTranslate(`${logs.length} 条文本变更已记录到 ${logPath}`);
}

export function logTextChanges(logPath: string, beforeTexts: Record<string, TextData>, afterTexts: TextData[]): void {
	const afterTextsMap = new Map(afterTexts.map((text) => [getTextKey(text), text]));
	let count = 0;

	for (const text of afterTexts) {
		const key = getTextKey(text);
		if (!key) {
			continue;
		}

		const beforeText = beforeTexts[key];
		if (!beforeText) {
			appendTranslateChangeLog(logPath, `text added: ${key}, ${formatTextSummary(text)}`);
			count++;
			continue;
		}

		const changes: string[] = [];
		if (getTextOriginal(beforeText) !== getTextOriginal(text)) {
			changes.push(
				`original ${formatLogText(getTextOriginal(beforeText))} -> ${formatLogText(getTextOriginal(text))}`,
			);
		}
		if (getTextTranslate(beforeText) !== getTextTranslate(text)) {
			changes.push(
				`translate ${formatLogText(getTextTranslate(beforeText))} -> ${formatLogText(getTextTranslate(text))}`,
			);
		}

		if (changes.length) {
			appendTranslateChangeLog(logPath, `text changed: ${key}, ${changes.join(", ")}`);
			count++;
		}
	}

	for (const text of Object.values(beforeTexts)) {
		const key = getTextKey(text);
		if (key && !afterTextsMap.has(key)) {
			appendTranslateChangeLog(logPath, `text removed: ${key}, ${formatTextSummary(text)}`);
			count++;
		}
	}

	if (count) {
		logPullTranslate(`${count} 条文本变更已记录到 ${logPath}`);
	}
}

export function writeNeedCheckTexts(texts: TextData[]): void {
	writeTranslateChangeLogs(
		pullTranslateChangeLogPath,
		texts.map((text) => `need check: ${text.msgctxt ?? ""}, ${formatTextSummary(text)}`),
	);
}
