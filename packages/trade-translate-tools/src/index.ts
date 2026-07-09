import fs from "node:fs";
import PO from "pofile";

export const defaultTradeTextsPath = "./data/trade-texts.po";
export const poe2Href = "www.pathofexile.com";
export const poe2TwHref = "www.pathofexile.tw";

export type TranslateSource = string;
export type TextData = InstanceType<typeof PO.Item>;
export type TradeDataKind = "items" | "stats" | "static" | "filters";

export interface TradeItemBaseConfig {
	type: string;
	text?: string;
}

export interface TradeItemUniqueConfig {
	type: string;
	text: string;
	name: string;
	disc?: string;
	flags: { unique: true };
}

export type TradeItemConfig = TradeItemBaseConfig | TradeItemUniqueConfig;

export interface TradeItemsGroup {
	id: string;
	label: string;
	entries: TradeItemConfig[];
}

export interface TradeItemsDataResponse {
	result: TradeItemsGroup[];
}

export interface TradeStatConfig {
	id: string;
	type: string;
	text: string;
}

export interface TradeStatsGroup {
	id: string;
	label: string;
	entries: TradeStatConfig[];
}

export interface TradeStatsResponse {
	result: TradeStatsGroup[];
}

export interface TradeStaticConfig {
	id: string;
	text: string;
	image?: string;
}

export interface TradeStaticsGroup {
	id: string;
	label: string;
	entries: TradeStaticConfig[];
}

export interface TradeStaticsDataResponse {
	result: TradeStaticsGroup[];
}

export interface FilterConfig {
	id: string;
	option?: {
		options: { id: string | null; text: string }[];
	};
	text?: string;
	fullSpan?: boolean;
	minMax?: boolean;
	halfSpan?: boolean;
	tip?: string;
	image?: string;
	input?: {
		placeholder: string;
	};
}

export interface TradeFiltersGroup {
	id: string;
	title?: string;
	hide?: boolean;
	filters: FilterConfig[];
}

export interface TradeFiltersDataResponse {
	result: TradeFiltersGroup[];
}

export interface PulledTextContext {
	texts: Map<string, TextData>;
	needCheckTexts: Map<string, TextData>;
}

export interface TradeTranslateLogOptions {
	prefix?: string;
	echo?: boolean;
	logger?: (message: string) => void;
}

export interface PullTradeTextOptions {
	logger?: (message: string) => void;
}

export interface PullOfficialTranslateOptions extends TradeTranslateLogOptions {
	texts: Record<string, TextData>;
	logPath: string;
}

export interface PullOfficialTranslateResult {
	updatedCount: number;
	skippedCount: number;
}

interface ApplyOfficialTranslateContext {
	texts: Record<string, TextData>;
	words: Map<string, string>;
	needCheckKeys: Set<string>;
	updatedCount: number;
	skippedCount: number;
	logPath: string;
	logOptions: TradeTranslateLogOptions;
}

const sourceCommentPattern = /^source:\s*(\S.*)$/;
const defaultTradeDataUserAgent =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0";

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

export function createPo(texts: TextData[]): PO {
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

export function readTextsFromPo(textsPath = defaultTradeTextsPath): Record<string, TextData> {
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

export function writeTextsToPo(texts: TextData[], textsPath = defaultTradeTextsPath): void {
	texts.sort((a, b) => (getTextKey(a) ?? "").localeCompare(getTextKey(b) ?? ""));
	fs.writeFileSync(textsPath, createPo(texts).toString());
}

export function readTexts(): Record<string, TextData> {
	return readTextsFromPo(defaultTradeTextsPath);
}

export function writeTexts(texts: TextData[]): void {
	writeTextsToPo(texts, defaultTradeTextsPath);
}

export function clearTranslateChangesLog(logPath: string): void {
	fs.mkdirSync("./tmp", { recursive: true });
	fs.writeFileSync(logPath, "");
}

export function appendTranslateChangeLog(logPath: string, log: string, options?: TradeTranslateLogOptions): void {
	const message = options?.prefix ? `[${options.prefix}] ${log}` : log;
	fs.mkdirSync("./tmp", { recursive: true });
	fs.appendFileSync(logPath, `${message}\n`);
	if (options?.echo) {
		(options.logger ?? console.log)(message);
	}
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

export function createPulledTextContext(): PulledTextContext {
	return {
		texts: new Map<string, TextData>(),
		needCheckTexts: new Map<string, TextData>(),
	};
}

export function isUniqueItem(item: TradeItemConfig): item is TradeItemUniqueConfig {
	return Boolean("flags" in item && item.flags.unique);
}

export async function fetchPoe2TradeData<T>(href: string, type: TradeDataKind): Promise<T> {
	const response = await fetch(`https://${href}/api/trade2/data/${type}`, {
		headers: {
			"user-agent": defaultTradeDataUserAgent,
		},
	});
	if (!response.ok) {
		throw new Error(`拉取 trade ${type} 数据失败：${href} ${response.status} ${response.statusText}`);
	}
	return (await response.json()) as T;
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

export function logTextChanges(
	logPath: string,
	beforeTexts: Record<string, TextData>,
	afterTexts: TextData[],
	options?: TradeTranslateLogOptions,
): number {
	const afterTextsMap = new Map(afterTexts.map((text) => [getTextKey(text), text]));
	let count = 0;

	for (const text of afterTexts) {
		const key = getTextKey(text);
		if (!key) {
			continue;
		}

		const beforeText = beforeTexts[key];
		if (!beforeText) {
			appendTranslateChangeLog(logPath, `text added: ${key}, ${formatTextSummary(text)}`, options);
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
			appendTranslateChangeLog(logPath, `text changed: ${key}, ${changes.join(", ")}`, options);
			count++;
		}
	}

	for (const text of Object.values(beforeTexts)) {
		const key = getTextKey(text);
		if (key && !afterTextsMap.has(key)) {
			appendTranslateChangeLog(logPath, `text removed: ${key}, ${formatTextSummary(text)}`, options);
			count++;
		}
	}

	return count;
}

export async function pullItemTexts(
	context: PulledTextContext,
	href: string,
	options?: PullTradeTextOptions,
): Promise<void> {
	options?.logger?.("开始拉取 items 数据");
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
	options?.logger?.("items 数据拉取完成");
}

export async function pullStatsTexts(
	context: PulledTextContext,
	href: string,
	options?: PullTradeTextOptions,
): Promise<void> {
	options?.logger?.("开始拉取 stats 数据");
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
	options?.logger?.("stats 数据拉取完成");
}

export async function pullStaticTexts(
	context: PulledTextContext,
	href: string,
	options?: PullTradeTextOptions,
): Promise<void> {
	options?.logger?.("开始拉取 static 数据");
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
	options?.logger?.("static 数据拉取完成");
}

export async function pullFilterTexts(
	context: PulledTextContext,
	href: string,
	options?: PullTradeTextOptions,
): Promise<void> {
	options?.logger?.("开始拉取 filters 数据");
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
	options?.logger?.("filters 数据拉取完成");
}

function createApplyOfficialTranslateContext(options: PullOfficialTranslateOptions): ApplyOfficialTranslateContext {
	return {
		texts: options.texts,
		words: new Map<string, string>(),
		needCheckKeys: new Set<string>(),
		updatedCount: 0,
		skippedCount: 0,
		logPath: options.logPath,
		logOptions: options,
	};
}

function formatLogSource(source: string | undefined): string {
	return source ?? "(none)";
}

function appendTextUpdateLog(
	context: ApplyOfficialTranslateContext,
	text: TextData,
	beforeTranslate: string | undefined,
	beforeSource: string | undefined,
): void {
	appendTranslateChangeLog(
		context.logPath,
		[
			`official 更新 ${getTextKey(text) ?? ""}`,
			`original=${formatLogText(getTextOriginal(text))}`,
			`translate ${formatLogText(beforeTranslate)} -> ${formatLogText(getTextTranslate(text))}`,
			`source ${formatLogSource(beforeSource)} -> ${formatLogSource(getTextSource(text))}`,
		].join(", "),
		context.logOptions,
	);
}

function applyOfficialTranslate(
	context: ApplyOfficialTranslateContext,
	key: string,
	original: string,
	translate: string | undefined,
): void {
	if (!translate) {
		return;
	}

	const text = context.texts[key];
	if (!text) {
		context.skippedCount++;
		return;
	}

	const beforeTranslate = getTextTranslate(text);
	const beforeSource = getTextSource(text);
	setTextTranslate(text, translate);
	setTextSource(text, "official");

	if (!context.words.has(original)) {
		context.words.set(original, translate);
	}

	if (beforeTranslate !== translate || beforeSource !== "official") {
		context.updatedCount++;
		appendTextUpdateLog(context, text, beforeTranslate, beforeSource);
	}
}

function markOfficialNeedCheck(
	context: ApplyOfficialTranslateContext,
	key: string,
	original: string,
	translate: string | undefined,
): void {
	context.needCheckKeys.add(key);
	appendTranslateChangeLog(
		context.logPath,
		`official need check: ${key}, original=${formatLogText(original)}, translate=${formatLogText(translate)}`,
		context.logOptions,
	);
}

async function pullItemOfficialTranslates(context: ApplyOfficialTranslateContext): Promise<void> {
	context.logOptions.logger?.("[official-translate] 开始拉取 items 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2Href, "items"),
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2TwHref, "items"),
	]);
	for (const group of data.result) {
		const twGroup = twData.result.find((g) => g.id === group.id);
		applyOfficialTranslate(context, `items/${group.id}`, group.label, twGroup?.label);
	}
	context.logOptions.logger?.("[official-translate] items 翻译数据拉取完成");
}

async function pullStatsOfficialTranslates(context: ApplyOfficialTranslateContext): Promise<void> {
	context.logOptions.logger?.("[official-translate] 开始拉取 stats 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStatsResponse>(poe2Href, "stats"),
		fetchPoe2TradeData<TradeStatsResponse>(poe2TwHref, "stats"),
	]);

	for (const group of data.result) {
		const groupTextKey = `stats/${group.id}`;
		const twGroup = twData.result.find((g) => g.id === group.id);
		applyOfficialTranslate(context, groupTextKey, group.label, twGroup?.label);

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
					markOfficialNeedCheck(context, entryTextKey, stat.text, translateText);
					continue;
				}

				applyOfficialTranslate(context, entryTextKey, stat.text, translateText);
			}
		}
	}
	context.logOptions.logger?.("[official-translate] stats 翻译数据拉取完成");
}

async function pullStaticOfficialTranslates(context: ApplyOfficialTranslateContext): Promise<void> {
	context.logOptions.logger?.("[official-translate] 开始拉取 static 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2Href, "static"),
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2TwHref, "static"),
	]);

	for (const group of data.result) {
		const groupTextKey = `static/${group.id}`;
		const twGroup = twData.result.find((g) => g.id === group.id);
		applyOfficialTranslate(context, groupTextKey, group.label, twGroup?.label);

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
					markOfficialNeedCheck(context, entryTextKey, staticConfig.text, translateText);
					continue;
				}

				applyOfficialTranslate(context, entryTextKey, staticConfig.text, translateText);
			}
		}
	}
	context.logOptions.logger?.("[official-translate] static 翻译数据拉取完成");
}

async function pullFilterOfficialTranslates(context: ApplyOfficialTranslateContext): Promise<void> {
	context.logOptions.logger?.("[official-translate] 开始拉取 filters 翻译数据");
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2Href, "filters"),
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2TwHref, "filters"),
	]);

	for (const group of data.result) {
		const groupTextKey = `filters/${group.id}`;
		const twGroup = twData.result.find((g) => g.id === group.id);
		if (group.title) {
			applyOfficialTranslate(context, groupTextKey, group.title, twGroup?.title);
		}
		for (const entry of group.filters) {
			const entryTextKey = `${groupTextKey}/${entry.id}`;
			const twEntry = twGroup?.filters.find((e) => e.id === entry.id);
			if (entry.text) {
				applyOfficialTranslate(context, entryTextKey, entry.text, twEntry?.text);
			}

			if (entry.tip) {
				applyOfficialTranslate(context, `${entryTextKey}/tip`, entry.tip, twEntry?.tip);
			}

			if (entry.option) {
				for (const option of entry.option.options) {
					const optionTextKey = `${entryTextKey}/${option.id}`;
					const twOption = twEntry?.option?.options.find((o) => o.id === option.id);
					applyOfficialTranslate(context, optionTextKey, option.text, twOption?.text);
				}
			}
		}
	}
	context.logOptions.logger?.("[official-translate] filters 翻译数据拉取完成");
}

function mergeOfficialWordTranslates(context: ApplyOfficialTranslateContext): void {
	for (const text of Object.values(context.texts)) {
		const key = getTextKey(text);
		if (key && context.needCheckKeys.has(key)) {
			continue;
		}

		const translate = context.words.get(getTextOriginal(text));
		if (!translate) {
			continue;
		}

		const beforeTranslate = getTextTranslate(text);
		const beforeSource = getTextSource(text);
		setTextTranslate(text, translate);
		setTextSource(text, "official");
		if (beforeTranslate !== translate || beforeSource !== "official") {
			context.updatedCount++;
			appendTextUpdateLog(context, text, beforeTranslate, beforeSource);
		}
	}
}

export async function pullOfficialTranslates(
	options: PullOfficialTranslateOptions,
): Promise<PullOfficialTranslateResult> {
	const context = createApplyOfficialTranslateContext(options);

	await Promise.all([
		pullItemOfficialTranslates(context),
		pullStatsOfficialTranslates(context),
		pullStaticOfficialTranslates(context),
		pullFilterOfficialTranslates(context),
	]);

	mergeOfficialWordTranslates(context);
	if (context.skippedCount) {
		appendTranslateChangeLog(
			context.logPath,
			`official translate skipped: ${context.skippedCount} 条台服文本没有对应 PO 条目`,
			context.logOptions,
		);
	}
	context.logOptions.logger?.(`[official-translate] 完成，更新 ${context.updatedCount} 条官方翻译`);

	return {
		updatedCount: context.updatedCount,
		skippedCount: context.skippedCount,
	};
}
