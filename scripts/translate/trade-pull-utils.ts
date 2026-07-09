import {
	appendTranslateChangeLog as appendTranslateChangeLogBase,
	clearTranslateChangesLog,
	createPulledTextContext,
	fetchPoe2TradeData,
	formatLogText,
	formatTextSummary,
	logTextChanges as logTextChangesBase,
	poe2Href,
	poe2TwHref,
	pullFilterTexts as pullFilterTextsBase,
	pullItemTexts as pullItemTextsBase,
	pullStaticTexts as pullStaticTextsBase,
	pullStatsTexts as pullStatsTextsBase,
	type PulledTextContext,
	type TextData,
} from "zeta-poe2-trade-translate-tools";

export {
	addPulledText,
	clearTranslateChangesLog,
	createPulledTextContext,
	fetchPoe2TradeData,
	formatLogText,
	formatTextSummary,
	poe2Href,
	poe2TwHref,
	type PulledTextContext,
	type TextData,
	type TradeFiltersDataResponse,
	type TradeItemsDataResponse,
	type TradeStaticsDataResponse,
	type TradeStatsResponse,
} from "zeta-poe2-trade-translate-tools";

export const pullTranslateChangeLogPath = "./tmp/pull-translate-changes.log";

const pullTranslateLogPrefix = "pull-translate";

export function logPullTranslate(message: string): void {
	console.log(`[${pullTranslateLogPrefix}] ${message}`);
}

export function appendTranslateChangeLog(logPath: string, log: string): void {
	appendTranslateChangeLogBase(logPath, log, {
		prefix: pullTranslateLogPrefix,
		echo: true,
	});
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
	const count = logTextChangesBase(logPath, beforeTexts, afterTexts, {
		prefix: pullTranslateLogPrefix,
		echo: true,
	});

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

export function pullItemTexts(context: PulledTextContext, href: string): Promise<void> {
	return pullItemTextsBase(context, href, { logger: logPullTranslate });
}

export function pullStatsTexts(context: PulledTextContext, href: string): Promise<void> {
	return pullStatsTextsBase(context, href, { logger: logPullTranslate });
}

export function pullStaticTexts(context: PulledTextContext, href: string): Promise<void> {
	return pullStaticTextsBase(context, href, { logger: logPullTranslate });
}

export function pullFilterTexts(context: PulledTextContext, href: string): Promise<void> {
	return pullFilterTextsBase(context, href, { logger: logPullTranslate });
}
