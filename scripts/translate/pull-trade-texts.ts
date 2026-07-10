import {
	clearTranslateChangesLog,
	logPullTranslate,
	logTextChanges,
	poe2Href,
	pullTranslateChangeLogPath,
	writeNeedCheckTexts,
} from "./trade-pull-utils";
import { createTextItem, getTextKey, getTextOriginal, readTexts, type TextData, writeTexts } from "./utils";
import {
	fetchPoe2TradeData,
	isUniqueItem,
	type TradeFiltersDataResponse,
	type TradeItemsDataResponse,
	type TradeStatConfig,
	type TradeStaticsDataResponse,
	type TradeStaticConfig,
	type TradeStatsResponse,
} from "zeta-poe2-trade-translate-tools/trade-api";

interface PulledTextContext {
	texts: Map<string, TextData>;
	needCheckTexts: Map<string, TextData>;
}

function createPulledTextContext(): PulledTextContext {
	return {
		texts: new Map<string, TextData>(),
		needCheckTexts: new Map<string, TextData>(),
	};
}

function addPulledText(
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

async function pullItemTexts(context: PulledTextContext, href: string): Promise<void> {
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

async function pullStatsTexts(context: PulledTextContext, href: string): Promise<void> {
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

async function pullStaticTexts(context: PulledTextContext, href: string): Promise<void> {
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

async function pullFilterTexts(context: PulledTextContext, href: string): Promise<void> {
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

function mergePulledOriginalTexts(texts: TextData[], beforeTexts = readTexts()): TextData[] {
	return texts.map((text) => {
		const key = getTextKey(text);
		const beforeText = key ? beforeTexts[key] : undefined;
		if (beforeText) {
			beforeText.msgctxt = key;
			beforeText.msgid = getTextOriginal(text);
			return beforeText;
		}

		return text;
	});
}

function writePulledOriginalTexts(texts: TextData[]): void {
	logPullTranslate("开始合并旧翻译并写入 PO 文件");
	const beforeTexts = readTexts();
	const beforeTextsForLog = readTexts();
	const mergedTexts = mergePulledOriginalTexts(texts, beforeTexts);
	logTextChanges(pullTranslateChangeLogPath, beforeTextsForLog, mergedTexts);
	writeTexts(mergedTexts);
	logPullTranslate("PO 文件写入完成");
}

async function pullTradeTexts(): Promise<void> {
	logPullTranslate("开始清理旧日志");
	clearTranslateChangesLog(pullTranslateChangeLogPath);
	logPullTranslate(`旧日志已清理：${pullTranslateChangeLogPath}`);

	const context = createPulledTextContext();

	await Promise.all([
		pullItemTexts(context, poe2Href),
		pullStatsTexts(context, poe2Href),
		pullStaticTexts(context, poe2Href),
		pullFilterTexts(context, poe2Href),
	]);

	writePulledOriginalTexts(Array.from(context.texts.values()));
	writeNeedCheckTexts(Array.from(context.needCheckTexts.values()));
	logPullTranslate(`完成，变更日志见 ${pullTranslateChangeLogPath}`);
}

await pullTradeTexts();
