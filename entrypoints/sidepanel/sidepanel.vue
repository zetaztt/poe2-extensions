<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
	getTradeItemCopyEnabled,
	getTradeStatPresetEnabled,
	getTradeTranslateEnabled,
	setTradeItemCopyEnabled,
	setTradeStatPresetEnabled,
	setTradeTranslateEnabled,
} from '@/src/settings';
import {
	addCurrentTradeSearchBookmark,
	getTradeBookmarkRootGroups,
	getTradeBookmarkRootTree,
	openTradeBookmark,
	type TradeBookmarkGroup,
	type TradeBookmarkTreeNode,
} from '@/src/trade/bookmarks';
import { createTradeFeaturesUpdateMessage } from '@/src/trade/messages';
import BookmarkTab from './components/bookmark-tab.vue';
import SettingsTab from './components/settings-tab.vue';

type ActiveTab = 'bookmarks' | 'settings';

const activeTab = ref<ActiveTab>('settings');
const tradeTranslateEnabled = ref(false);
const tradeItemCopyEnabled = ref(false);
const tradeStatPresetEnabled = ref(false);
const isLoadingSettings = ref(true);
const isSavingSettings = ref(false);
const settingsStatusText = ref('');

const bookmarkGroups = ref<TradeBookmarkGroup[]>([]);
const bookmarkTree = ref<TradeBookmarkTreeNode | null>(null);
const isLoadingBookmarks = ref(true);
const isSavingBookmark = ref(false);
const bookmarkStatusText = ref('');
const didInitializeBookmarks = ref(false);

const bookmarkCount = computed(() => (
	bookmarkGroups.value.reduce((total, group) => total + group.bookmarks.length, 0)
));

onMounted(async () => {
	await Promise.all([
		loadSettings(),
		loadBookmarks(),
	]);
});

watch(activeTab, (tab) => {
	if (tab === 'bookmarks') void loadBookmarks();
});

async function loadSettings(): Promise<void> {
	isLoadingSettings.value = true;

	const [translateEnabled, itemCopyEnabled, statPresetEnabled] = await Promise.all([
		getTradeTranslateEnabled(),
		getTradeItemCopyEnabled(),
		getTradeStatPresetEnabled(),
	]);

	tradeTranslateEnabled.value = translateEnabled;
	tradeItemCopyEnabled.value = itemCopyEnabled;
	tradeStatPresetEnabled.value = statPresetEnabled;
	isLoadingSettings.value = false;
}

async function loadBookmarks(): Promise<void> {
	isLoadingBookmarks.value = true;
	bookmarkStatusText.value = '';

	try {
		const [groups, tree] = await Promise.all([
			getTradeBookmarkRootGroups(),
			getTradeBookmarkRootTree(),
		]);

		bookmarkGroups.value = groups;
		bookmarkTree.value = tree;
		if (!didInitializeBookmarks.value) activeTab.value = 'bookmarks';
	} catch (error) {
		bookmarkGroups.value = [];
		bookmarkTree.value = null;
		activeTab.value = 'settings';
		bookmarkStatusText.value = '本地书签读取失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签读取失败', error);
	} finally {
		didInitializeBookmarks.value = true;
		isLoadingBookmarks.value = false;
	}
}

async function onAddCurrentSearch(folderId?: string): Promise<void> {
	const rootFolderId = bookmarkTree.value?.id;
	const targetFolderId = folderId ?? rootFolderId;
	if (!targetFolderId || !rootFolderId) {
		bookmarkStatusText.value = '本地书签未加载，请稍后重试。';
		return;
	}

	isSavingBookmark.value = true;
	bookmarkStatusText.value = '';

	try {
		await addCurrentTradeSearchBookmark(targetFolderId);
		const [groups, tree] = await Promise.all([
			getTradeBookmarkRootGroups(),
			getTradeBookmarkRootTree(),
		]);
		bookmarkGroups.value = groups;
		bookmarkTree.value = tree;
		bookmarkStatusText.value = '当前 trade2 搜索已添加到书签。';
	} catch (error) {
		bookmarkStatusText.value = error instanceof Error ? error.message : '添加书签失败，请稍后重试。';
		console.error('[poe2-extensions] trade 搜索书签添加失败', error);
	} finally {
		isSavingBookmark.value = false;
	}
}

async function onOpenBookmark(url: string): Promise<void> {
	try {
		await openTradeBookmark(url);
	} catch (error) {
		bookmarkStatusText.value = '打开书签失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签打开失败', error);
	}
}

async function onTranslateToggle(nextValue: boolean): Promise<void> {
	const previousValue = tradeTranslateEnabled.value;

	tradeTranslateEnabled.value = nextValue;
	isSavingSettings.value = true;
	settingsStatusText.value = '';

	try {
		await setTradeTranslateEnabled(nextValue);
		const reloaded = await reloadActiveTradeTab();
		settingsStatusText.value = reloaded ? '设置已保存，trade2 页面已刷新。' : '设置已保存，打开或刷新 trade2 页面后生效。';
	} catch (error) {
		tradeTranslateEnabled.value = previousValue;
		settingsStatusText.value = '设置保存失败，请稍后重试。';
		console.error('[poe2-extensions] 中文翻译设置保存失败', error);
	} finally {
		isSavingSettings.value = false;
	}
}

async function onItemCopyToggle(nextValue: boolean): Promise<void> {
	const previousValue = tradeItemCopyEnabled.value;

	tradeItemCopyEnabled.value = nextValue;
	isSavingSettings.value = true;
	settingsStatusText.value = '';

	try {
		await setTradeItemCopyEnabled(nextValue);
		const updated = await updateActiveTradeTabFeatures();
		settingsStatusText.value = updated ? '设置已保存，trade2 页面已更新。' : '设置已保存，打开或刷新 trade2 页面后生效。';
	} catch (error) {
		tradeItemCopyEnabled.value = previousValue;
		settingsStatusText.value = '设置保存失败，请稍后重试。';
		console.error('[poe2-extensions] 复制物品文本设置保存失败', error);
	} finally {
		isSavingSettings.value = false;
	}
}

async function onStatPresetToggle(nextValue: boolean): Promise<void> {
	const previousValue = tradeStatPresetEnabled.value;

	tradeStatPresetEnabled.value = nextValue;
	isSavingSettings.value = true;
	settingsStatusText.value = '';

	try {
		await setTradeStatPresetEnabled(nextValue);
		const updated = await updateActiveTradeTabFeatures();
		settingsStatusText.value = updated ? '设置已保存，trade2 页面已更新。' : '设置已保存，打开或刷新 trade2 页面后生效。';
	} catch (error) {
		tradeStatPresetEnabled.value = previousValue;
		settingsStatusText.value = '设置保存失败，请稍后重试。';
		console.error('[poe2-extensions] 筛选预设保存设置保存失败', error);
	} finally {
		isSavingSettings.value = false;
	}
}

async function reloadActiveTradeTab(): Promise<boolean> {
	const [tab] = await browser.tabs.query({
		active: true,
		currentWindow: true,
	});

	if (!tab?.id || !isTrade2Url(tab.url)) return false;

	await browser.tabs.reload(tab.id);
	return true;
}

async function updateActiveTradeTabFeatures(): Promise<boolean> {
	const [tab] = await browser.tabs.query({
		active: true,
		currentWindow: true,
	});

	if (!tab?.id || !isTrade2Url(tab.url)) return false;

	try {
		await browser.tabs.sendMessage(tab.id, createTradeFeaturesUpdateMessage({
			translate: tradeTranslateEnabled.value,
			itemCopy: tradeItemCopyEnabled.value,
			statPreset: tradeStatPresetEnabled.value,
		}));
		return true;
	} catch (error) {
		console.warn('[poe2-extensions] trade2 页面设置同步失败', error);
		return false;
	}
}

function setActiveTab(tab: ActiveTab): void {
	activeTab.value = tab;
}

function isTrade2Url(url: string | undefined): boolean {
	if (!url) return false;

	try {
		const parsedUrl = new URL(url);
		return parsedUrl.origin === 'https://www.pathofexile.com' && parsedUrl.pathname.startsWith('/trade2');
	} catch {
		return false;
	}
}

</script>

<template>
	<main class="app">
		<header class="header">
			<p class="eyebrow">POE2 Extensions</p>
			<h1>Trade 工具</h1>
		</header>

		<nav class="tabs" aria-label="侧边栏页面">
			<button
				class="tab-button"
				:class="{ active: activeTab === 'bookmarks' }"
				type="button"
				@click="setActiveTab('bookmarks')"
			>
				书签
			</button>
			<button
				class="tab-button"
				:class="{ active: activeTab === 'settings' }"
				type="button"
				@click="setActiveTab('settings')"
			>
				设置
			</button>
		</nav>

		<BookmarkTab
			v-if="activeTab === 'bookmarks'"
			:bookmark-tree="bookmarkTree"
			:bookmark-groups="bookmarkGroups"
			:bookmark-count="bookmarkCount"
			:is-loading-bookmarks="isLoadingBookmarks"
			:is-saving-bookmark="isSavingBookmark"
			:bookmark-status-text="bookmarkStatusText"
			@refresh="loadBookmarks"
			@add-current-search="onAddCurrentSearch"
			@open-bookmark="onOpenBookmark"
		/>

		<SettingsTab
			v-else
			:trade-translate-enabled="tradeTranslateEnabled"
			:trade-item-copy-enabled="tradeItemCopyEnabled"
			:trade-stat-preset-enabled="tradeStatPresetEnabled"
			:is-loading-settings="isLoadingSettings"
			:is-saving-settings="isSavingSettings"
			:settings-status-text="settingsStatusText"
			@toggle-translate="onTranslateToggle"
			@toggle-item-copy="onItemCopyToggle"
			@toggle-stat-preset="onStatPresetToggle"
		/>
	</main>
</template>

<style scoped>
.app {
	min-height: 100vh;
	padding: 20px;
	color: #f4efe4;
	background: #15110c;
}

.header {
	margin-bottom: 16px;
}

.eyebrow {
	margin: 0 0 6px;
	color: #d7a85f;
	font-size: 12px;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

h1,
p {
	margin: 0;
}

h1 {
	font-size: 24px;
}

.tabs {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 6px;
	margin-bottom: 12px;
	padding: 4px;
	border: 1px solid #3b3024;
	border-radius: 8px;
	background: #211a13;
}

.tabs.single {
	grid-template-columns: 1fr;
}

.tab-button {
	min-height: 34px;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: #c9bba7;
	font: inherit;
	cursor: pointer;
}

.tab-button.active {
	background: #6f5124;
	color: #f4efe4;
}
</style>
