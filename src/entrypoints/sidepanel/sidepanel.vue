<script lang="ts" setup>
import { ref } from 'vue';
import BookmarkTab from './bookmarks/bookmark-tab.vue';
import SettingsTab from './settings/settings-tab.vue';

type ActiveTab = 'bookmarks' | 'settings';

const activeTab = ref<ActiveTab>('settings');
const didInitializeBookmarks = ref(false);

function setActiveTab(tab: ActiveTab): void {
	activeTab.value = tab;
}

function onBookmarksInitialized(success: boolean): void {
	if (didInitializeBookmarks.value) return;

	didInitializeBookmarks.value = true;
	activeTab.value = success ? 'bookmarks' : 'settings';
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
			v-show="activeTab === 'bookmarks'"
			:active="activeTab === 'bookmarks'"
			@initialized="onBookmarksInitialized"
		/>

		<SettingsTab v-show="activeTab === 'settings'" />
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
