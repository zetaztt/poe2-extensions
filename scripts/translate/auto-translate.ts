import type { Response as PlaywrightResponse } from "playwright";
import type { Awaitable } from "@crawlee/types";
import {
	CheerioCrawler,
	PlaywrightCrawler,
	ProxyConfiguration,
	type RequestOptions,
	type CheerioCrawlingContext,
} from "crawlee";
import {
	clearTranslateChangesLog,
	readTexts,
	type TextData,
	type TranslateSource,
	updatePoTextsByKey,
	writeAutoTranslateTexts,
	writeTranslateChangeLogs,
} from "./utils";

clearTranslateChangesLog("auto-translate");

const force = process.argv.includes("--force");
const texts = readTexts();
const autoTranslateTexts: Record<string, string> = {};
const protectedOriginals = new Set(
	Object.values(texts)
		.filter((text) => text.translate && text.source !== "auto" && !text.backfilled)
		.map((text) => text.original),
);
const existingAutoOriginals = new Set(
	Object.values(texts)
		.filter((text) => text.translate && text.source === "auto" && !text.backfilled)
		.map((text) => text.original),
);

interface PoeDbSearchTranslateHandler {
	isMatch(text: TextData): boolean;

	getSearchText(text: TextData): string | undefined;

	handleTranslate(context: CheerioCrawlingContext): Awaitable<string | undefined | void>;
}

const poeDbReplaceCharMap = new Map([
	[" ", "_"],
	["'", ""],
	["(", "%28"],
	[")", "%29"],
]);

const replaceCharRegex = new RegExp(`[${[...poeDbReplaceCharMap.keys()].join("")}]`, "g");

type ExistingTranslateSource = Exclude<TranslateSource, "backfill">;

interface ExistingTranslate {
	translate: string;
	source: ExistingTranslateSource;
}

const sourcePriority: Record<ExistingTranslateSource, number> = {
	manual: 3,
	official: 2,
	auto: 1,
};

function getHigherPrioritySource(
	source: ExistingTranslateSource,
	nextSource: ExistingTranslateSource,
): ExistingTranslateSource {
	return sourcePriority[source] >= sourcePriority[nextSource] ? source : nextSource;
}

function fillEmptyTextsByExistingTranslate(): void {
	const existingTranslates = new Map<string, ExistingTranslate>();
	const ambiguousLogs: string[] = [];

	for (const text of Object.values(texts)) {
		if (!text.translate || !text.source || text.source === "backfill" || text.backfilled) {
			continue;
		}

		const existingTranslate = existingTranslates.get(text.original);
		if (!existingTranslate) {
			existingTranslates.set(text.original, {
				translate: text.translate,
				source: text.source,
			});
			continue;
		}

		if (existingTranslate.translate !== text.translate) {
			ambiguousLogs.push(
				`ambiguous translate for original "${text.original}": use first "${existingTranslate.translate}", ignored "${text.translate}" from ${text.key}`,
			);
			continue;
		}

		existingTranslate.source = getHigherPrioritySource(existingTranslate.source, text.source);
	}

	const updates: Record<string, { translate: string; source: "backfill"; backfilled: true }> = {};

	for (const text of Object.values(texts)) {
		if (!text.backfilled && text.translate) {
			continue;
		}

		const existingTranslate = existingTranslates.get(text.original);
		if (!existingTranslate) {
			continue;
		}

		if (text.translate === existingTranslate.translate && text.source === "backfill" && text.backfilled) {
			continue;
		}

		text.translate = existingTranslate.translate;
		text.source = "backfill";
		text.backfilled = true;
		updates[text.key] = { translate: existingTranslate.translate, source: "backfill", backfilled: true };
	}

	writeTranslateChangeLogs("auto-translate", ambiguousLogs);

	if (Object.keys(updates).length) {
		updatePoTextsByKey(updates, "auto-translate");
	}
}

function hasTranslate(text: TextData): boolean {
	return (
		protectedOriginals.has(text.original)
		|| (!force && existingAutoOriginals.has(text.original))
		|| !!autoTranslateTexts[text.original]
	);
}

function setAutoTranslate(text: TextData, translate: string): void {
	if (protectedOriginals.has(text.original)) {
		delete autoTranslateTexts[text.original];
		return;
	}
	autoTranslateTexts[text.original] = translate;
}

async function translateByPoeDbAutoComplete() {
	const crawler = new PlaywrightCrawler({
		// maxConcurrency: 1,
		proxyConfiguration: new ProxyConfiguration({
			proxyUrls: ["http://127.0.0.1:10808"], // 你的本地代理地址
		}),
		async requestHandler({ page, request, log }) {
			const responsePromise = new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					page.off("response", onResponse);
					reject(new Error("Timed out waiting for autocompletecb_tw"));
				}, 30_000);

				log.info("Waiting for autocompletecb_tw response...");

				const onResponse = async (response: PlaywrightResponse) => {
					try {
						if (!response.url().includes("autocompletecb_tw")) {
							return;
						}

						log.info("Captured autocompletecb_tw");

						const autocompleteList = await response.json();

						const autoCompleteMap = new Map<string, string>();

						for (const autoCompleteData of autocompleteList) {
							autoCompleteMap.set(autoCompleteData.value, autoCompleteData.label);
						}

						for (const text of Object.values(texts)) {
							if (hasTranslate(text)) {
								continue;
							}

							const searchText = text.original.replace(
								replaceCharRegex,
								(c) => poeDbReplaceCharMap.get(c) ?? c,
							);
							const autoCompleteText = autoCompleteMap.get(searchText);
							if (autoCompleteText) {
								setAutoTranslate(text, autoCompleteText);
								console.log(
									"translate by auto complete",
									text.original,
									"=>",
									autoTranslateTexts[text.original],
								);
							}
						}

						// log.info(body);
						clearTimeout(timeout);
						page.off("response", onResponse);
						resolve();
					} catch (error) {
						clearTimeout(timeout);
						page.off("response", onResponse);
						reject(error);
					}
				};

				page.on("response", onResponse);
			});

			await page.goto(request.url, { waitUntil: "domcontentloaded" });
			await responsePromise;
		},
	});

	await crawler.run(["https://poe2db.tw/tw/"]);
}

const boeDbSearchTranslateHandlers: PoeDbSearchTranslateHandler[] = [
	{
		isMatch(text: TextData): boolean {
			return text.key.startsWith("items");
		},
		getSearchText(text: TextData): string | undefined {
			return text.original;
		},
		handleTranslate: ({ $ }) => {
			const tabName = $("[data-tabname]")?.attr("data-tabname");
			if (tabName) {
				return tabName.replace(/\s*<small>.*<\/small>\s*/i, "").trim();
			}
		},
	},
	{
		isMatch(text: TextData): boolean {
			return text.key.startsWith("stats") && text.original.startsWith("Allocates ");
		},
		getSearchText(text: TextData): string | undefined {
			return text.original.replace("Allocates ", "");
		},
		handleTranslate: ({ $ }) => {
			const name = $(`meta[property="og:title"]`)?.attr("content")?.trim();
			if (name) {
				return "配置" + name;
			}
		},
	},
];

function getPoeDbSearchTranslateHandler(text: TextData): PoeDbSearchTranslateHandler | undefined {
	return boeDbSearchTranslateHandlers.find((h) => h.isMatch(text));
}

async function translateByPoeDbSearch() {
	const requests: RequestOptions[] = [];

	for (const text of Object.values(texts)) {
		if (hasTranslate(text)) {
			continue;
		}

		const handler = getPoeDbSearchTranslateHandler(text);
		if (!handler) {
			continue;
		}

		let searchText = handler.getSearchText(text);

		if (searchText) {
			searchText = searchText.replace(replaceCharRegex, (c) => poeDbReplaceCharMap.get(c) ?? c);

			requests.push({
				url: `https://poe2db.tw/tw/${searchText}`,
				userData: { key: text.key },
			});
		}
	}

	if (!requests.length) {
		return;
	}

	const crawler = new CheerioCrawler({
		maxConcurrency: 20,
		// maxRequestsPerMinute: 30,
		proxyConfiguration: new ProxyConfiguration({
			proxyUrls: ["http://127.0.0.1:10808"], // 你的本地代理地址
		}),
		async requestHandler(context) {
			const { log, request } = context;
			const text = texts[request.userData.key]!;
			log.info("Handling search page for: " + request.url);
			const handler = getPoeDbSearchTranslateHandler(text);
			if (handler) {
				const translate = await handler.handleTranslate(context);
				if (translate) {
					setAutoTranslate(text, translate);
					console.log("translate by search", text.original, "=>", autoTranslateTexts[text.original]);
				}
			}
		},
	});

	await crawler.run(requests);
}

fillEmptyTextsByExistingTranslate();

await translateByPoeDbAutoComplete();
await translateByPoeDbSearch();

const translates = new Map<string, Set<string>>();

for (const [original, translate] of Object.entries(autoTranslateTexts)) {
	let translateList = translates.get(original);
	if (!translateList) {
		translates.set(original, (translateList = new Set()));
	}
	translateList.add(translate);
}

for (const text of Object.values(texts)) {
	if (!hasTranslate(text)) {
		const translateList = translates.get(text.original);
		if (translateList && translateList.size > 0) {
			if (translateList.size === 1) {
				setAutoTranslate(text, translateList.values().next().value!);
			} else {
				console.warn(
					`Multiple translates for original ${text.key}:`,
					text.original,
					"=>",
					Array.from(translateList.values())
						.map((str) => `"${str}"`)
						.join(" "),
				);
			}
		}
	}
}

writeAutoTranslateTexts(Object.entries(autoTranslateTexts));
