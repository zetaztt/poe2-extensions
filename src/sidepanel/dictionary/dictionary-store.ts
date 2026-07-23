import { computed, readonly, ref, shallowRef } from "vue";
import {
	DictionaryServiceEventType,
	getCurrentDictionary,
	getDictionaryServiceError,
	isDictionaryServiceLoading,
	loadDictionary as loadDictionaryFromService,
	subscribeDictionary,
	type DictionaryServiceEvent,
} from "../../modules/dictionary/dictionary-service";
import type { DictionarySearchResult, TranslateDictionary } from "../../modules/dictionary/dictionary-types";

interface DictionarySearchEntry extends DictionarySearchResult {
	normalizedOriginal: string;
	normalizedTranslated: string;
	order: number;
}

export interface DictionaryStoreError {
	sequence: number;
	error: unknown;
}

const defaultMaxResults = 20;
const dictionary = shallowRef<TranslateDictionary | null>(getCurrentDictionary());
const isLoading = ref(isDictionaryServiceLoading());
const lastError = shallowRef<DictionaryStoreError | null>(createInitialError());
// 搜索索引只依赖字典版本，不进入 Vue 响应式系统，避免大型词表的额外代理开销。
let searchIndex = createSearchIndex(dictionary.value);
let errorSequence = lastError.value?.sequence ?? 0;
let loadPromise: Promise<TranslateDictionary> | null = null;
let isSubscribed = false;

const readonlyDictionary = computed<TranslateDictionary | null>(() => dictionary.value);
const readonlyIsLoading = readonly(isLoading);
const readonlyLastError = readonly(lastError);

export function useDictionaryStore() {
	ensureSubscribed();

	return {
		dictionary: readonlyDictionary,
		isLoading: readonlyIsLoading,
		lastError: readonlyLastError,
		loadDictionary,
		searchDictionary,
	};
}

function loadDictionary(): Promise<TranslateDictionary> {
	if (dictionary.value) return Promise.resolve(dictionary.value);
	if (loadPromise) return loadPromise;

	isLoading.value = true;
	loadPromise = loadDictionaryFromService()
		.then((loadedDictionary) => {
			// service 事件通常已经同步应用；仅在无订阅事件时补齐状态，避免重复构建大型索引。
			if (dictionary.value !== loadedDictionary) applyDictionary(loadedDictionary);
			return loadedDictionary;
		})
		.finally(() => {
			isLoading.value = false;
			loadPromise = null;
		});
	return loadPromise;
}

function searchDictionary(query: string, maxResults = defaultMaxResults): DictionarySearchResult[] {
	const normalizedQuery = normalizeSearchText(query);
	if (!normalizedQuery || !dictionary.value) return [];

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

function ensureSubscribed(): void {
	if (isSubscribed) return;
	isSubscribed = true;
	subscribeDictionary(onDictionaryServiceEvent);
}

function onDictionaryServiceEvent(event: DictionaryServiceEvent): void {
	if (event.type === DictionaryServiceEventType.Loaded) {
		applyDictionary(event.dictionary);
		lastError.value = null;
		return;
	}

	errorSequence += 1;
	lastError.value = { sequence: errorSequence, error: event.error };
}

function applyDictionary(value: TranslateDictionary): void {
	dictionary.value = value;
	searchIndex = createSearchIndex(value);
}

function createSearchIndex(value: TranslateDictionary | null): DictionarySearchEntry[] {
	if (!value) return [];
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

function createInitialError(): DictionaryStoreError | null {
	const error = getDictionaryServiceError();
	return error ? { sequence: 1, error } : null;
}

export type { DictionarySearchResult } from "../../modules/dictionary/dictionary-types";
