import { isUniqueItem, TradeFiltersDataResponse, TradeItemsDataResponse, TradeStatConfig, TradeStaticConfig, TradeStaticsDataResponse, TradeStatsResponse } from "@/src/trade-translate/types";
import { readTexts, type TextData, writeTexts } from "./utils";

const poe2TwHref = "www.pathofexile.tw";
const poe2Href = "www.pathofexile.com";

const texts = new Map<string, TextData>();
const words = new Map<string, string>();

function setText(key: string, original: string, translate?: string, options?: {
	needCheck?: boolean,
	muteMultiWarn?: boolean
}) {
	if (!original) {
		return;
	}

	let { needCheck, muteMultiWarn } = options ?? {};

	if (texts.has(key)) {
		if (!muteMultiWarn) {
			console.error("Could not set text map for key '" + key + "'");
		}
		return;
	}

	if (!translate) {
		needCheck = undefined;
	}

	if (needCheck) {
		console.warn("text need check '" + key + "'", translate);
	}

	texts.set(key, {
		key,
		original,
		translate,
		needCheck
	});

	if (translate) {
		words.set(original, translate);
	}
}

async function fetchPoe2TradeData<T>(href: string, type: string): Promise<T> {
	const response = await fetch(`https://${href}/api/trade2/data/${type}`, {
		headers: {
			"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0"
		}
	});
	return response.json();
}

async function pullItemTexts() {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2Href, "items"),
		fetchPoe2TradeData<TradeItemsDataResponse>(poe2TwHref, "items")
	]);
	for (const group of data.result) {
		const groupTextKey = `items/${group.id}`;

		const twGroup = twData.result.find(g => g.id === group.id);

		setText(groupTextKey, group.label, twGroup?.label);

		for (const entry of group.entries) {
			if (isUniqueItem(entry)) {
				setText(`${groupTextKey}/${entry.name}`, entry.name, "", {
					muteMultiWarn: true
				});
			}

			setText(`${groupTextKey}/${entry.type}`, entry.type, "", {
				muteMultiWarn: true
			});
		}
	}

}

async function pullStatsTexts() {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStatsResponse>(poe2Href, "stats"),
		fetchPoe2TradeData<TradeStatsResponse>(poe2TwHref, "stats")
	]);

	for (const group of data.result) {
		const groupTextKey = `stats/${group.id}`;

		const twGroup = twData.result.find(g => g.id === group.id);

		setText(groupTextKey, group.label, twGroup?.label);

		const statsMap = new Map<string, TradeStatConfig[]>();
		const twStatsMap = new Map<string, TradeStatConfig[]>();

		for (const entry of group.entries) {
			let stats = statsMap.get(entry.id);
			if (!stats) {
				statsMap.set(entry.id, stats = []);
			}
			stats.push(entry);
		}

		if (twGroup) {
			for (const group of twGroup.entries) {
				let stats = twStatsMap.get(group.id);
				if (!stats) {
					twStatsMap.set(group.id, stats = []);
				}
				stats.push(group);
			}
		}

		for (const [id, stats] of statsMap) {
			const twStats = twStatsMap.get(id);
			for (const [i, stat] of stats.entries()) {
				const entryTextKey = `${groupTextKey}/${id}/${stat.text}`;

				const translateText = twStats?.[i]?.text;
				setText(entryTextKey, stat.text, translateText, {
					needCheck: stats.length !== twStats?.length && stats.length > 1
				});

			}
		}
	}
}

async function pullStaticTexts() {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2Href, "static"),
		fetchPoe2TradeData<TradeStaticsDataResponse>(poe2TwHref, "static"),
	]);

	for (const group of data.result) {
		const groupTextKey = `static/${group.id}`;

		const twGroup = twData.result.find(g => g.id === group.id);

		setText(groupTextKey, group.label, twGroup?.label);

		const staticsMap = new Map<string, TradeStaticConfig[]>();
		const twStaticsMap = new Map<string, TradeStaticConfig[]>();

		for (const entry of group.entries) {
			let staticConfig = staticsMap.get(entry.id);
			if (!staticConfig) {
				staticsMap.set(entry.id, staticConfig = []);
			}
			staticConfig.push(entry);
		}

		if (twGroup) {
			for (const group of twGroup.entries) {
				let staticConfig = twStaticsMap.get(group.id);
				if (!staticConfig) {
					twStaticsMap.set(group.id, staticConfig = []);
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
				setText(entryTextKey, staticConfig.text, translateText, {
					needCheck: staticConfigs.length !== twStaticConfigs?.length && staticConfigs.length > 1
				});

			}
		}
	}
}

async function pullFilterTexts() {
	const [data, twData] = await Promise.all([
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2Href, "filters"),
		fetchPoe2TradeData<TradeFiltersDataResponse>(poe2TwHref, "filters")
	]);

	for (const group of data.result) {
		const groupTextKey = `filters/${group.id}`;
		const twGroup = twData.result.find(g => g.id === group.id);
		if (group.title) {
			setText(groupTextKey, group.title, twGroup?.title);
		}
		for (const entry of group.filters) {
			const entryTextKey = `${groupTextKey}/${entry.id}`;
			const twEntry = twGroup?.filters.find(e => e.id === entry.id);
			if (entry.text) {
				setText(entryTextKey, entry.text, twEntry?.text);
			}

			if (entry.tip) {
				setText(`${entryTextKey}/tip`, entry.tip, twEntry?.tip);
			}

			if (entry.option) {
				for (const option of entry.option.options) {
					const optionTextKey = `${entryTextKey}/${option.id}`;
					const twOption = twEntry?.option?.options.find(o => o.id === option.id);
					setText(optionTextKey, option.text, twOption?.text);
				}
			}
		}
	}
}

function mergeTexts() {
	for (const text of texts.values()) {
		if (!text.translate && words.get(text.original)) {
			text.translate = words.get(text.original);
		}
	}
}

await Promise.all([
	pullItemTexts(),
	pullStatsTexts(),
	pullStaticTexts(),
	pullFilterTexts(),
]);

mergeTexts();
writeTexts(Array.from(texts.values()));

