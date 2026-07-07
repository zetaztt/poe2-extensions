import {
	appendTranslateChangeLog,
	clearTranslateChangesLog,
	fetchPoe2TradeData,
	formatLogText,
	logPullTranslate,
	logTextChanges,
	poe2Href,
	poe2TwHref,
	pullTranslateChangeLogPath,
} from "./trade-pull-utils";
import {
	TradeFiltersDataResponse,
	TradeItemsDataResponse,
	TradeStaticsDataResponse,
	TradeStaticConfig,
	TradeStatsResponse,
	TradeStatConfig,
} from "../../src/trade/trade-types";
import {
	createTextItem,
	getTextKey,
	getTextOriginal,
	getTextTranslate,
	readTexts,
	setTextSource,
	setTextTranslate,
	type TextData,
	writeTexts,
} from "./utils";

interface ApplyTranslateContext {
	existingTexts: Record<string, TextData>;
	words: Map<string, string>;
	needCheckTexts: Map<string, TextData>;
	updatedCount: number;
	skippedCount: number;
}

function createApplyTranslateContext(existingTexts: Record<string, TextData>): ApplyTranslateContext {
	return {
		existingTexts,
		words: new Map<string, string>(),
		needCheckTexts: new Map<string, TextData>(),
		updatedCount: 0,
		skippedCount: 0,
	};
}

function applyTranslate(
	context: ApplyTranslateContext,
	key: string,
	original: string,
	translate: string | undefined,
): void {
	if (!translate) {
		return;
	}

	const text = context.existingTexts[key];
	if (!text) {
		context.skippedCount++;
		return;
	}

	const beforeTranslate = getTextTranslate(text);
	setTextTranslate(text, translate);
	setTextSource(text, "official");

	if (!context.words.has(original)) {
		context.words.set(original, translate);
	}

	if (beforeTranslate !== translate) {
		context.updatedCount++;
	}
}

function markNeedCheck(
	context: ApplyTranslateContext,
	key: string,
	original: string,
	translate: string | undefined,
): void {
	const text = createTextItem(key, original, translate);
	context.needCheckTexts.set(key, text);
	appendTranslateChangeLog(
		pullTranslateChangeLogPath,
		`need check: ${getTextKey(text) ?? ""}, original=${formatLogText(getTextOriginal(text))}, translate=${formatLogText(
			getTextTranslate(text),
		)}`,
	);
}

async function pullItemTranslates(context: ApplyTranslateContext): Promise<void> {
	logPullTranslate("开始拉取 items 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2Href, "items"),
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2TwHref, "items"),
	]);
	for (const group of data.result) {
		const twGroup = twData.result.find((g) => g.id === group.id);
		applyTranslate(context, `items/${group.id}`, group.label, twGroup?.label);
	}
	logPullTranslate("items 翻译数据拉取完成");
}

async function pullStatsTranslates(context: ApplyTranslateContext): Promise<void> {
	logPullTranslate("开始拉取 stats 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStatsResponse>(poe2Href, "stats"),
		fetchPoe2TradeData<TradeStatsResponse>(poe2TwHref, "stats"),
	]);

	for (const group of data.result) {
		const groupTextKey = `stats/${group.id}`;
		const twGroup = twData.result.find((g) => g.id === group.id);
		applyTranslate(context, groupTextKey, group.label, twGroup?.label);

		const statsMap = new Map<string, TradeStatConfig[]>();
		const twStatsMap = new Map<string, TradeStatConfig[]>();

		for (const entry of group.entries) {
			let stats = statsMap.get(entry.id);
			if (!stats) {
				statsMap.set(entry.id, (stats = []));
			}
			stats.push(entry);
		}

		if (twGroup) {
			for (const entry of twGroup.entries) {
				let stats = twStatsMap.get(entry.id);
				if (!stats) {
					twStatsMap.set(entry.id, (stats = []));
				}
				stats.push(entry);
			}
		}

		for (const [id, stats] of statsMap) {
			const twStats = twStatsMap.get(id);
			for (const [i, stat] of stats.entries()) {
				const entryTextKey = `${groupTextKey}/${id}/${stat.text}`;
				const translateText = twStats?.[i]?.text;

				if (stats.length !== twStats?.length && stats.length > 1) {
					markNeedCheck(context, entryTextKey, stat.text, translateText);
					continue;
				}

				applyTranslate(context, entryTextKey, stat.text, translateText);
			}
		}
	}
	logPullTranslate("stats 翻译数据拉取完成");
}

async function pullStaticTranslates(context: ApplyTranslateContext): Promise<void> {
	logPullTranslate("开始拉取 static 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2Href, "static"),
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2TwHref, "static"),
	]);

	for (const group of data.result) {
		const groupTextKey = `static/${group.id}`;
		const twGroup = twData.result.find((g) => g.id === group.id);
		applyTranslate(context, groupTextKey, group.label, twGroup?.label);

		const staticsMap = new Map<string, TradeStaticConfig[]>();
		const twStaticsMap = new Map<string, TradeStaticConfig[]>();

		for (const entry of group.entries) {
			let staticConfig = staticsMap.get(entry.id);
			if (!staticConfig) {
				staticsMap.set(entry.id, (staticConfig = []));
			}
			staticConfig.push(entry);
		}

		if (twGroup) {
			for (const entry of twGroup.entries) {
				let staticConfig = twStaticsMap.get(entry.id);
				if (!staticConfig) {
					twStaticsMap.set(entry.id, (staticConfig = []));
				}
				staticConfig.push(entry);
			}
		}

		for (const [id, staticConfigs] of staticsMap) {
			const twStaticConfigs = twStaticsMap.get(id);
			for (const [i, staticConfig] of staticConfigs.entries()) {
				if (!staticConfig.text) {
					continue;
				}
				const entryTextKey = `${groupTextKey}/${id}/${staticConfig.text}`;
				const translateText = twStaticConfigs?.[i]?.text;

				if (staticConfigs.length !== twStaticConfigs?.length && staticConfigs.length > 1) {
					markNeedCheck(context, entryTextKey, staticConfig.text, translateText);
					continue;
				}

				applyTranslate(context, entryTextKey, staticConfig.text, translateText);
			}
		}
	}
	logPullTranslate("static 翻译数据拉取完成");
}

async function pullFilterTranslates(context: ApplyTranslateContext): Promise<void> {
	logPullTranslate("开始拉取 filters 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2Href, "filters"),
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2TwHref, "filters"),
	]);

	for (const group of data.result) {
		const groupTextKey = `filters/${group.id}`;
		const twGroup = twData.result.find((g) => g.id === group.id);
		if (group.title) {
			applyTranslate(context, groupTextKey, group.title, twGroup?.title);
		}
		for (const entry of group.filters) {
			const entryTextKey = `${groupTextKey}/${entry.id}`;
			const twEntry = twGroup?.filters.find((e) => e.id === entry.id);
			if (entry.text) {
				applyTranslate(context, entryTextKey, entry.text, twEntry?.text);
			}

			if (entry.tip) {
				applyTranslate(context, `${entryTextKey}/tip`, entry.tip, twEntry?.tip);
			}

			if (entry.option) {
				for (const option of entry.option.options) {
					const optionTextKey = `${entryTextKey}/${option.id}`;
					const twOption = twEntry?.option?.options.find((o) => o.id === option.id);
					applyTranslate(context, optionTextKey, option.text, twOption?.text);
				}
			}
		}
	}
	logPullTranslate("filters 翻译数据拉取完成");
}

function mergeWordTranslates(context: ApplyTranslateContext): void {
	for (const text of Object.values(context.existingTexts)) {
		const key = getTextKey(text);
		if (key && context.needCheckTexts.has(key)) {
			continue;
		}

		const translate = context.words.get(getTextOriginal(text));
		if (!translate) {
			continue;
		}

		const beforeTranslate = getTextTranslate(text);
		setTextTranslate(text, translate);
		setTextSource(text, "official");
		if (beforeTranslate !== translate) {
			context.updatedCount++;
		}
	}
}

function writeSkippedTranslateSummary(count: number): void {
	if (!count) {
		return;
	}

	appendTranslateChangeLog(pullTranslateChangeLogPath, `translate skipped: ${count} 条台服文本没有对应 PO 条目`);
}

function writePulledTranslates(context: ApplyTranslateContext, beforeTextsForLog: Record<string, TextData>): void {
	const texts = Object.values(context.existingTexts);
	logTextChanges(pullTranslateChangeLogPath, beforeTextsForLog, texts);
	writeTexts(texts);
	logPullTranslate(`PO 文件写入完成，更新 ${context.updatedCount} 条翻译`);
}

async function pullTradeTranslates(): Promise<void> {
	logPullTranslate("开始清理旧日志");
	clearTranslateChangesLog(pullTranslateChangeLogPath);
	logPullTranslate(`旧日志已清理：${pullTranslateChangeLogPath}`);

	const beforeTextsForLog = readTexts();
	const context = createApplyTranslateContext(readTexts());

	await Promise.all([
		pullItemTranslates(context),
		pullStatsTranslates(context),
		pullStaticTranslates(context),
		pullFilterTranslates(context),
	]);

	mergeWordTranslates(context);
	writePulledTranslates(context, beforeTextsForLog);
	writeSkippedTranslateSummary(context.skippedCount);
	logPullTranslate(`完成，变更日志见 ${pullTranslateChangeLogPath}`);
}

await pullTradeTranslates();
