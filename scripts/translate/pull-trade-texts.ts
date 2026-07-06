import fs from "node:fs";
import {
	TradeItemsDataResponse,
	TradeStatsResponse,
	TradeStatConfig,
	TradeStaticsDataResponse,
	TradeStaticConfig,
	TradeFiltersDataResponse,
} from "../../src/trade/trade-types";
import { isUniqueItem } from "../../src/trade/trade-utils";
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

const poe2TwHref = "www.pathofexile.tw";
const poe2Href = "www.pathofexile.com";

const translateChangeLogPaths = {
	"pull-translate": "./tmp/pull-translate-changes.log",
} as const;

type TranslateChangeLogSource = keyof typeof translateChangeLogPaths;

interface PullTradeTextsContext {
	texts: Map<string, TextData>;
	needCheckTexts: Map<string, TextData>;
	words: Map<string, string>;
}

function createPullTradeTextsContext(): PullTradeTextsContext {
	return {
		texts: new Map<string, TextData>(),
		needCheckTexts: new Map<string, TextData>(),
		words: new Map<string, string>(),
	};
}

function formatLogText(text: string | undefined): string {
	return text ? `"${text}"` : "(empty)";
}

function formatTextSummary(text: TextData): string {
	return [
		`original=${formatLogText(getTextOriginal(text))}`,
		`translate=${formatLogText(getTextTranslate(text))}`,
	].join(", ");
}

function clearTranslateChangesLog(source: TranslateChangeLogSource): void {
	fs.mkdirSync("./tmp", { recursive: true });
	fs.writeFileSync(translateChangeLogPaths[source], "");
}

function writeTranslateChangeLogs(source: TranslateChangeLogSource, logs: string[]): void {
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
	const afterTextsMap = new Map(afterTexts.map((text) => [getTextKey(text), text]));
	const logs: string[] = [];

	for (const text of afterTexts) {
		const key = getTextKey(text);
		if (!key) {
			continue;
		}

		const beforeText = beforeTexts[key];
		if (!beforeText) {
			logs.push(`text added: ${key}, ${formatTextSummary(text)}`);
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
			logs.push(`text changed: ${key}, ${changes.join(", ")}`);
		}
	}

	for (const text of Object.values(beforeTexts)) {
		const key = getTextKey(text);
		if (key && !afterTextsMap.has(key)) {
			logs.push(`text removed: ${key}, ${formatTextSummary(text)}`);
		}
	}

	writeTranslateChangeLogs(source, logs);
}

function mergeTranslateTexts(texts: TextData[], beforeTexts = readTexts()): TextData[] {
	return texts.map((text) => {
		if (getTextTranslate(text)) {
			return text;
		}

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

function writePulledTexts(texts: TextData[]) {
	const beforeTexts = readTexts();
	const mergedTexts = mergeTranslateTexts(texts, beforeTexts);
	logTextChanges("pull-translate", beforeTexts, mergedTexts);
	writeTexts(mergedTexts);
}

function writeNeedCheckTexts(texts: TextData[]) {
	writeTranslateChangeLogs(
		"pull-translate",
		texts.map((text) => `need check: ${getTextKey(text) ?? ""}, ${formatTextSummary(text)}`),
	);
}

function setText(
	context: PullTradeTextsContext,
	key: string,
	original: string,
	translate?: string,
	options?: {
		needCheck?: boolean;
		muteMultiWarn?: boolean;
	},
) {
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
		console.warn("text need check '" + key + "'", translate);
		context.needCheckTexts.set(key, createTextItem(key, original));
		translate = undefined;
	}

	const text = createTextItem(key, original, translate);
	if (translate) {
		setTextSource(text, "official");
		context.words.set(original, translate);
	}
	context.texts.set(key, text);
}

async function fetchPoe2TradeData<T>(href: string, type: string): Promise<T> {
	const response = await fetch(`https://${href}/api/trade2/data/${type}`, {
		headers: {
			"user-agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0",
		},
	});
	return response.json();
}

async function pullItemTexts(context: PullTradeTextsContext) {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2Href, "items"),
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2TwHref, "items"),
	]);
	for (const group of data.result) {
		const groupTextKey = `items/${group.id}`;

		const twGroup = twData.result.find((g) => g.id === group.id);

		setText(context, groupTextKey, group.label, twGroup?.label);

		for (const entry of group.entries) {
			if (isUniqueItem(entry)) {
				setText(context, `${groupTextKey}/${entry.name}`, entry.name, "", {
					muteMultiWarn: true,
				});
			}

			setText(context, `${groupTextKey}/${entry.type}`, entry.type, "", {
				muteMultiWarn: true,
			});
		}
	}
}

async function pullStatsTexts(context: PullTradeTextsContext) {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStatsResponse>(poe2Href, "stats"),
		fetchPoe2TradeData<TradeStatsResponse>(poe2TwHref, "stats"),
	]);

	for (const group of data.result) {
		const groupTextKey = `stats/${group.id}`;

		const twGroup = twData.result.find((g) => g.id === group.id);

		setText(context, groupTextKey, group.label, twGroup?.label);

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
			for (const group of twGroup.entries) {
				let stats = twStatsMap.get(group.id);
				if (!stats) {
					twStatsMap.set(group.id, (stats = []));
				}
				stats.push(group);
			}
		}

		for (const [id, stats] of statsMap) {
			const twStats = twStatsMap.get(id);
			for (const [i, stat] of stats.entries()) {
				const entryTextKey = `${groupTextKey}/${id}/${stat.text}`;

				const translateText = twStats?.[i]?.text;
				setText(context, entryTextKey, stat.text, translateText, {
					needCheck: stats.length !== twStats?.length && stats.length > 1,
				});
			}
		}
	}
}

async function pullStaticTexts(context: PullTradeTextsContext) {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2Href, "static"),
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2TwHref, "static"),
	]);

	for (const group of data.result) {
		const groupTextKey = `static/${group.id}`;

		const twGroup = twData.result.find((g) => g.id === group.id);

		setText(context, groupTextKey, group.label, twGroup?.label);

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
			for (const group of twGroup.entries) {
				let staticConfig = twStaticsMap.get(group.id);
				if (!staticConfig) {
					twStaticsMap.set(group.id, (staticConfig = []));
				}
				staticConfig.push(group);
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
				setText(context, entryTextKey, staticConfig.text, translateText, {
					needCheck: staticConfigs.length !== twStaticConfigs?.length && staticConfigs.length > 1,
				});
			}
		}
	}
}

async function pullFilterTexts(context: PullTradeTextsContext) {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2Href, "filters"),
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2TwHref, "filters"),
	]);

	for (const group of data.result) {
		const groupTextKey = `filters/${group.id}`;
		const twGroup = twData.result.find((g) => g.id === group.id);
		if (group.title) {
			setText(context, groupTextKey, group.title, twGroup?.title);
		}
		for (const entry of group.filters) {
			const entryTextKey = `${groupTextKey}/${entry.id}`;
			const twEntry = twGroup?.filters.find((e) => e.id === entry.id);
			if (entry.text) {
				setText(context, entryTextKey, entry.text, twEntry?.text);
			}

			if (entry.tip) {
				setText(context, `${entryTextKey}/tip`, entry.tip, twEntry?.tip);
			}

			if (entry.option) {
				for (const option of entry.option.options) {
					const optionTextKey = `${entryTextKey}/${option.id}`;
					const twOption = twEntry?.option?.options.find((o) => o.id === option.id);
					setText(context, optionTextKey, option.text, twOption?.text);
				}
			}
		}
	}
}

function mergeTexts(context: PullTradeTextsContext) {
	for (const text of context.texts.values()) {
		const key = getTextKey(text);
		const original = getTextOriginal(text);
		if (key && context.needCheckTexts.has(key)) {
			continue;
		}
		if (!getTextTranslate(text) && context.words.get(original)) {
			setTextTranslate(text, context.words.get(original));
			setTextSource(text, "official");
		}
	}
}

async function pullTradeTexts() {
	clearTranslateChangesLog("pull-translate");

	const context = createPullTradeTextsContext();

	await Promise.all([
		pullItemTexts(context),
		pullStatsTexts(context),
		pullStaticTexts(context),
		pullFilterTexts(context),
	]);

	mergeTexts(context);
	writePulledTexts(Array.from(context.texts.values()));
	writeNeedCheckTexts(Array.from(context.needCheckTexts.values()));
}

await pullTradeTexts();
