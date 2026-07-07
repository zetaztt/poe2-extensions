import fs from "node:fs";
import {
	TradeFiltersDataResponse,
	TradeItemsDataResponse,
	TradeStatConfig,
	TradeStaticsDataResponse,
	TradeStaticConfig,
	TradeStatsResponse,
} from "../../src/trade/trade-types";
import { isUniqueItem } from "../../src/trade/trade-utils";
import { createTextItem, getTextKey, getTextOriginal, getTextTranslate, type TextData } from "./utils";

export const poe2Href = "www.pathofexile.com";
export const poe2TwHref = "www.pathofexile.tw";
export const pullTranslateChangeLogPath = "./tmp/pull-translate-changes.log";

const pullTranslateLogPrefix = "pull-translate";

export interface PulledTextContext {
	texts: Map<string, TextData>;
	needCheckTexts: Map<string, TextData>;
}

export function createPulledTextContext(): PulledTextContext {
	return {
		texts: new Map<string, TextData>(),
		needCheckTexts: new Map<string, TextData>(),
	};
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
		texts.map((text) => `need check: ${getTextKey(text) ?? ""}, ${formatTextSummary(text)}`),
	);
}

export function addPulledText(
	context: PulledTextContext,
	key: string,
	original: string,
	options?: {
		needCheck?: boolean;
		muteMultiWarn?: boolean;
	},
): void {
	if (!original) {
		return;
	}

	const { needCheck, muteMultiWarn } = options ?? {};

	if (context.texts.has(key)) {
		if (!muteMultiWarn) {
			console.error("Could not set text map for key '" + key + "'");
		}
		return;
	}

	if (needCheck) {
		console.warn("text need check '" + key + "'");
		context.needCheckTexts.set(key, createTextItem(key, original));
		return;
	}

	context.texts.set(key, createTextItem(key, original));
}

export async function fetchPoe2TradeData<T>(href: string, type: string): Promise<T> {
	const response = await fetch(`https://${href}/api/trade2/data/${type}`, {
		headers: {
			"user-agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0",
		},
	});
	return response.json();
}

export async function pullItemTexts(context: PulledTextContext, href: string): Promise<void> {
	logPullTranslate("开始拉取 items 数据");
	const data = await fetchPoe2TradeData<TradeItemsDataResponse>(href, "items");
	for (const group of data.result) {
		const groupTextKey = `items/${group.id}`;

		addPulledText(context, groupTextKey, group.label);

		for (const entry of group.entries) {
			if (isUniqueItem(entry)) {
				addPulledText(context, `${groupTextKey}/${entry.name}`, entry.name, {
					muteMultiWarn: true,
				});
			}

			addPulledText(context, `${groupTextKey}/${entry.type}`, entry.type, {
				muteMultiWarn: true,
			});
		}
	}
	logPullTranslate("items 数据拉取完成");
}

export async function pullStatsTexts(context: PulledTextContext, href: string): Promise<void> {
	logPullTranslate("开始拉取 stats 数据");
	const data = await fetchPoe2TradeData<TradeStatsResponse>(href, "stats");

	for (const group of data.result) {
		const groupTextKey = `stats/${group.id}`;

		addPulledText(context, groupTextKey, group.label);

		const statsMap = new Map<string, TradeStatConfig[]>();

		for (const entry of group.entries) {
			let stats = statsMap.get(entry.id);
			if (!stats) {
				statsMap.set(entry.id, (stats = []));
			}
			stats.push(entry);
		}

		for (const [id, stats] of statsMap) {
			for (const stat of stats) {
				const entryTextKey = `${groupTextKey}/${id}/${stat.text}`;
				addPulledText(context, entryTextKey, stat.text);
			}
		}
	}
	logPullTranslate("stats 数据拉取完成");
}

export async function pullStaticTexts(context: PulledTextContext, href: string): Promise<void> {
	logPullTranslate("开始拉取 static 数据");
	const data = await fetchPoe2TradeData<TradeStaticsDataResponse>(href, "static");

	for (const group of data.result) {
		const groupTextKey = `static/${group.id}`;

		addPulledText(context, groupTextKey, group.label);

		const staticsMap = new Map<string, TradeStaticConfig[]>();

		for (const entry of group.entries) {
			let staticConfig = staticsMap.get(entry.id);
			if (!staticConfig) {
				staticsMap.set(entry.id, (staticConfig = []));
			}
			staticConfig.push(entry);
		}

		for (const [id, staticConfigs] of staticsMap) {
			for (const staticConfig of staticConfigs) {
				if (!staticConfig.text) {
					continue;
				}
				const entryTextKey = `${groupTextKey}/${id}/${staticConfig.text}`;
				addPulledText(context, entryTextKey, staticConfig.text);
			}
		}
	}
	logPullTranslate("static 数据拉取完成");
}

export async function pullFilterTexts(context: PulledTextContext, href: string): Promise<void> {
	logPullTranslate("开始拉取 filters 数据");
	const data = await fetchPoe2TradeData<TradeFiltersDataResponse>(href, "filters");

	for (const group of data.result) {
		const groupTextKey = `filters/${group.id}`;
		if (group.title) {
			addPulledText(context, groupTextKey, group.title);
		}
		for (const entry of group.filters) {
			const entryTextKey = `${groupTextKey}/${entry.id}`;
			if (entry.text) {
				addPulledText(context, entryTextKey, entry.text);
			}

			if (entry.tip) {
				addPulledText(context, `${entryTextKey}/tip`, entry.tip);
			}

			if (entry.option) {
				for (const option of entry.option.options) {
					const optionTextKey = `${entryTextKey}/${option.id}`;
					addPulledText(context, optionTextKey, option.text);
				}
			}
		}
	}
	logPullTranslate("filters 数据拉取完成");
}
