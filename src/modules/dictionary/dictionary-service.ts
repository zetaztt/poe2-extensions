import { ipcMain } from "../../ipc/ipc";
import { dictionaryIpcProtocol } from "./dictionary-ipc-protocol";
import type { DictionarySearchResult, TranslateDictionary } from "./dictionary-types";

interface DictionarySearchEntry extends DictionarySearchResult {
	normalizedOriginal: string;
	normalizedTranslated: string;
	order: number;
}

const defaultMaxResults = 20;
let indexedDictionary: TranslateDictionary | null = null;
let searchIndex: DictionarySearchEntry[] = [];

function loadDictionary(): Promise<TranslateDictionary> {
	return ipcMain.invoke(dictionaryIpcProtocol.load);
}

function searchDictionary(
	dictionary: TranslateDictionary,
	query: string,
	maxResults = defaultMaxResults,
): DictionarySearchResult[] {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery) return [];
	if (indexedDictionary !== dictionary) {
		indexedDictionary = dictionary;
		searchIndex = createSearchIndex(dictionary);
	}

	return searchIndex
		.map((entry) => ({
			entry,
			rank: Math.min(
				getMatchRank(entry.normalizedOriginal, normalizedQuery),
				getMatchRank(entry.normalizedTranslated, normalizedQuery),
			),
		}))
		.filter((match) => match.rank < Number.POSITIVE_INFINITY)
		.sort((left, right) => left.rank - right.rank || left.entry.order - right.entry.order)
		.slice(0, Math.max(0, Math.trunc(maxResults)))
		.map(({ entry }) => ({ original: entry.original, translated: entry.translated }));
}

function createSearchIndex(value: TranslateDictionary): DictionarySearchEntry[] {
	return Object.entries(value).map(([original, translated], order) => ({
		original,
		translated,
		normalizedOriginal: normalizeSearchText(original),
		normalizedTranslated: normalizeSearchText(translated),
		order,
	}));
}

function getMatchRank(text: string, search: string): number {
	if (text === search) return 0;
	if (text.startsWith(search)) return 1;
	if (text.includes(search)) return 2;
	return Number.POSITIVE_INFINITY;
}

function normalizeSearchText(value: string): string {
	return value.trim().toLocaleLowerCase();
}

export const dictionaryService = {
	loadDictionary,
	searchDictionary,
};
