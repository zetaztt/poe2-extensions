<script lang="ts" setup>
import browser from "webextension-polyfill";
import { onBeforeUnmount, ref, watch } from "vue";
import type { TranslateDictionary } from "../../translate-dictionary";
import {
	createPoeTranslationFetchMessage,
	isPoeTranslationMessage,
	PoeTranslationMessageType,
} from "../../trade/translate/trade-translate-messages";

interface Props {
	active: boolean;
}

interface DictionarySearchEntry {
	original: string;
	translated: string;
	normalizedOriginal: string;
	normalizedTranslated: string;
	order: number;
}

interface DictionarySearchResult {
	original: string;
	translated: string;
}

const props = defineProps<Props>();

const maxResults = 20;
const searchDebounceMs = 300;

const query = ref("");
const results = ref<DictionarySearchResult[]>([]);
const isLoading = ref(false);
const isSearching = ref(false);
const loadError = ref("");
const copiedOriginal = ref("");
const copyError = ref("");

let hasLoaded = false;
let searchIndex: DictionarySearchEntry[] = [];
let searchTimer: number | null = null;
let copyTimer: number | null = null;

watch(
	() => props.active,
	(active) => {
		if (active && !hasLoaded && !isLoading.value) {
			void loadDictionary();
		}
	},
	{ immediate: true },
);

watch(query, (value) => {
	if (searchTimer !== null) {
		window.clearTimeout(searchTimer);
		searchTimer = null;
	}

	if (!value.trim()) {
		isSearching.value = false;
		results.value = [];
		return;
	}

	isSearching.value = true;
	searchTimer = window.setTimeout(() => {
		searchTimer = null;
		searchDictionary(value);
	}, searchDebounceMs);
});

onBeforeUnmount(() => {
	if (searchTimer !== null) window.clearTimeout(searchTimer);
	if (copyTimer !== null) window.clearTimeout(copyTimer);
});

async function loadDictionary(): Promise<void> {
	isLoading.value = true;
	loadError.value = "";

	try {
		const dictionary = await requestDictionary();
		searchIndex = createSearchIndex(dictionary);
		hasLoaded = true;

		if (query.value.trim()) searchDictionary(query.value);
	} catch (error) {
		loadError.value = error instanceof Error ? error.message : "翻译字典加载失败";
	} finally {
		isLoading.value = false;
	}
}

async function requestDictionary(): Promise<TranslateDictionary> {
	const requestId = createRequestId();
	const response: unknown = await browser.runtime.sendMessage(createPoeTranslationFetchMessage(requestId));

	if (!isPoeTranslationMessage(response) || response.requestId !== requestId) {
		throw new Error("翻译字典响应无效");
	}

	if (response.type === PoeTranslationMessageType.Error) {
		throw new Error(response.error.message);
	}

	if (response.type !== PoeTranslationMessageType.Result) {
		throw new Error("翻译字典响应类型无效");
	}

	return response.dictionary;
}

function createSearchIndex(dictionary: TranslateDictionary): DictionarySearchEntry[] {
	return Object.entries(dictionary).map(([original, translated], order) => ({
		original,
		translated,
		normalizedOriginal: normalizeSearchText(original),
		normalizedTranslated: normalizeSearchText(translated),
		order,
	}));
}

function searchDictionary(value: string): void {
	const normalizedQuery = normalizeSearchText(value);
	if (!normalizedQuery || !hasLoaded) {
		isSearching.value = false;
		results.value = [];
		return;
	}

	results.value = searchIndex
		.map((entry) => ({
			entry,
			rank: Math.min(
				getMatchRank(entry.normalizedOriginal, normalizedQuery),
				getMatchRank(entry.normalizedTranslated, normalizedQuery),
			),
		}))
		.filter((match) => match.rank < Number.POSITIVE_INFINITY)
		.sort((left, right) => left.rank - right.rank || left.entry.order - right.entry.order)
		.slice(0, maxResults)
		.map(({ entry }) => ({
			original: entry.original,
			translated: entry.translated,
		}));
	isSearching.value = false;
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

async function copyOriginal(original: string): Promise<void> {
	copyError.value = "";

	try {
		await navigator.clipboard.writeText(original);
		copiedOriginal.value = original;
		resetCopyStatusLater();
	} catch (error) {
		copiedOriginal.value = "";
		copyError.value = "复制失败，请检查浏览器剪贴板权限。";
		console.warn("[poe2-extensions] 词典英文原文复制失败", error);
	}
}

function resetCopyStatusLater(): void {
	if (copyTimer !== null) window.clearTimeout(copyTimer);

	copyTimer = window.setTimeout(() => {
		copiedOriginal.value = "";
		copyTimer = null;
	}, 1_500);
}

function retryLoad(): void {
	hasLoaded = false;
	isSearching.value = false;
	searchIndex = [];
	results.value = [];
	void loadDictionary();
}

function createRequestId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `dictionary-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
</script>

<template>
	<section class="dictionary-tab">
		<section class="panel">
			<label class="search-label" for="dictionary-search">词典搜索</label>
			<input
				id="dictionary-search"
				v-model="query"
				class="search-input"
				type="search"
				placeholder="输入中文或英文"
				autocomplete="off"
				:disabled="isLoading || Boolean(loadError)" />
			<p class="search-description">搜索翻译字典中的中英文词条，最多显示 20 条结果。</p>
		</section>

		<section v-if="isLoading" class="panel state-panel" aria-live="polite">正在加载翻译字典...</section>

		<section v-else-if="loadError" class="panel state-panel error" aria-live="polite">
			<p>{{ loadError }}</p>
			<button class="retry-button" type="button" @click="retryLoad">重新加载</button>
		</section>

		<template v-else>
			<p v-if="copyError" class="copy-error" aria-live="polite">{{ copyError }}</p>

			<section v-if="isSearching" class="panel state-panel" aria-live="polite">正在搜索...</section>

			<section v-else-if="query.trim() && results.length === 0" class="panel state-panel" aria-live="polite">
				没有找到匹配词条。
			</section>

			<ul v-else-if="results.length > 0" class="result-list" aria-live="polite">
				<li v-for="result in results" :key="result.original" class="result-item">
					<div class="result-content">
						<strong class="translated">{{ result.translated }}</strong>
						<span class="original">{{ result.original }}</span>
					</div>
					<button class="copy-button" type="button" @click="copyOriginal(result.original)">
						{{ copiedOriginal === result.original ? "已复制" : "复制英文" }}
					</button>
				</li>
			</ul>
		</template>
	</section>
</template>

<style scoped>
.dictionary-tab {
	display: grid;
	gap: 0;
	padding: 8px;
	background: #000;
}

.panel {
	padding: 8px;
	border: 0;
	border-radius: 0;
	background: #000;
}

.search-label {
	display: block;
	margin: -8px -8px 8px;
	padding: 5px 2px;
	border-bottom: 1px solid #4a4a4a;
	color: #e2e2e2;
	background: #000;
	font-family: FontinSmallCaps, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	font-weight: 400;
}

.search-input {
	width: 100%;
	min-height: var(--control-height);
	padding: 6px 8px;
	border: 1px solid #000;
	border-radius: 0;
	outline: none;
	background: #1e2124;
	box-shadow: var(--shadow-inset);
	color: #e2e2e2;
}

.search-input:focus {
	border-color: #a38d6d;
	box-shadow: var(--shadow-inset);
}

.search-input:disabled {
	opacity: 0.6;
}

.search-description,
.state-panel,
.original,
.copy-error {
	color: var(--color-text);
}

.search-description {
	margin: 6px 0 0;
	font-size: 11px;
	line-height: 1.4;
}

.state-panel {
	margin-top: 1px;
	border: 1px solid #222;
	background: #101112;
	font-size: 14px;
	text-align: center;
}

.state-panel p {
	margin: 0;
}

.state-panel.error,
.copy-error {
	color: var(--color-warning);
}

.retry-button,
.copy-button {
	border: 1px solid var(--color-button-primary-border);
	border-radius: 0;
	background: var(--color-button-primary);
	color: #fff;
	cursor: pointer;
}

.retry-button {
	min-height: 32px;
	margin-top: 10px;
	padding: 0 12px;
}

.copy-error {
	margin: 0;
	font-size: 13px;
}

.result-list {
	display: grid;
	gap: 1px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.result-item {
	display: flex;
	align-items: center;
	gap: 10px;
	min-height: 46px;
	padding: 6px 8px;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	border-radius: 0;
	background: #101112;
}

.result-item:hover {
	background: #181818;
}

.result-content {
	display: grid;
	flex: 1;
	gap: 4px;
	min-width: 0;
}

.translated,
.original {
	overflow-wrap: anywhere;
}

.translated {
	color: #e2e2e2;
	font-size: 13px;
}

.original {
	font-family: FontinRegular, Verdana, Arial, sans-serif;
	font-size: 12px;
}

.copy-button {
	flex: none;
	min-height: 32px;
	padding: 0 10px;
	font-size: 12px;
}

.retry-button:hover,
.copy-button:hover {
	border-color: #527da7;
	background: #183f63;
	color: #fff;
}

@media (max-width: 360px) {
	.result-item {
		align-items: stretch;
		flex-direction: column;
	}

	.copy-button {
		width: 100%;
	}
}
</style>
