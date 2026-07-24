import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { dictionaryService } from "./dictionary-service";
import type { DictionarySearchResult, TranslateDictionary } from "./dictionary-types";

interface DictionaryStoreError {
	sequence: number;
	error: unknown;
}

export const useDictionaryStore = defineStore("dictionary", () => {
	const dictionary = shallowRef<TranslateDictionary | null>(null);
	const isLoading = ref(false);
	const lastError = shallowRef<DictionaryStoreError | null>(null);
	let dictionaryPromise: Promise<TranslateDictionary> | null = null;

	function clearError(): void {
		lastError.value = null;
	}

	function setError(error: unknown): void {
		const sequence = (lastError.value?.sequence ?? 0) + 1;
		lastError.value = { sequence, error };
	}

	function loadDictionary(): Promise<TranslateDictionary> {
		if (dictionary.value) return Promise.resolve(dictionary.value);
		if (dictionaryPromise) return dictionaryPromise;

		isLoading.value = true;
		dictionaryPromise = dictionaryService
			.loadDictionary()
			.then((value) => {
				dictionary.value = value;
				clearError();
				return value;
			})
			.catch((error: unknown) => {
				setError(error);
				throw error;
			})
			.finally(() => {
				isLoading.value = false;
				dictionaryPromise = null;
			});
		return dictionaryPromise;
	}

	function searchDictionary(query: string, maxResults?: number): DictionarySearchResult[] {
		if (!dictionary.value) return [];
		return dictionaryService.searchDictionary(dictionary.value, query, maxResults);
	}

	return {
		dictionary,
		isLoading,
		lastError,
		loadDictionary,
		searchDictionary,
	};
});

if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useDictionaryStore, import.meta.hot));
}
