<script lang="ts" setup>
import { computed, ref, type Component } from "vue";
import BookmarkTab from "./bookmarks/bookmark-tab.vue";
import { closeMenu } from "./common/menu/sidepanel-menu";
import DictionaryTab from "./dictionary/dictionary-tab.vue";
import SettingsTab from "./settings/settings-tab.vue";

enum SidepanelTab {
	Bookmarks = 1,
	Dictionary = 2,
	Settings = 3,
}

const tabComponents: Record<SidepanelTab, Component> = {
	[SidepanelTab.Bookmarks]: BookmarkTab,
	[SidepanelTab.Dictionary]: DictionaryTab,
	[SidepanelTab.Settings]: SettingsTab,
};

const activeTab = ref<SidepanelTab>(SidepanelTab.Bookmarks);
const activeComponent = computed(() => tabComponents[activeTab.value]);

function setActiveTab(tab: SidepanelTab): void {
	activeTab.value = tab;
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
				:class="{ active: activeTab === SidepanelTab.Bookmarks }"
				type="button"
				@click="setActiveTab(SidepanelTab.Bookmarks)">
				书签
			</button>
			<button
				class="tab-button"
				:class="{ active: activeTab === SidepanelTab.Dictionary }"
				type="button"
				@click="setActiveTab(SidepanelTab.Dictionary)">
				词典
			</button>
			<button
				class="tab-button"
				:class="{ active: activeTab === SidepanelTab.Settings }"
				type="button"
				@click="setActiveTab(SidepanelTab.Settings)">
				设置
			</button>
		</nav>

		<KeepAlive :max="3">
			<component :is="activeComponent" :key="activeTab" />
		</KeepAlive>
	</main>
</template>

<style scoped>
.app {
	display: grid;
	grid-template-rows: auto auto minmax(0, 1fr);
	height: 100vh;
	min-height: 100vh;
	padding: 0 8px 12px;
	color: var(--color-text-primary);
	background: rgb(0 0 0 / 38%);
}

.header {
	height: 92px;
	padding: 22px 12px 12px;
	border-bottom: 1px solid rgb(0 0 0 / 80%);
	background: linear-gradient(90deg, rgb(14 17 21 / 82%), rgb(14 17 21 / 28%));
	text-shadow: 1px 1px 2px #000;
}

.eyebrow {
	margin: 0 0 4px;
	color: #a38d6d;
	font-family: FontinSmallCaps, Verdana, Arial, sans-serif;
	font-size: 13px;
	letter-spacing: 0.5px;
	text-transform: uppercase;
}

h1,
p {
	margin: 0;
}

h1 {
	color: #f5f5f5;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 24px;
	font-weight: 400;
}

.tabs {
	position: sticky;
	top: 0;
	z-index: 10;
	display: grid;
	grid-template-columns: repeat(4, 1fr);
	gap: 0;
	margin-bottom: 0;
	border: 0;
	background: #000;
	box-shadow: none;
}

.tabs.single {
	grid-template-columns: 1fr;
}

.tab-button {
	height: 32px;
	border: 1px solid #000;
	border-bottom-color: #333;
	border-radius: 0;
	background: #0a0a0ae6;
	color: #e9cf9f;
	font: inherit;
	font-family: FontinSmallCaps, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	cursor: pointer;
}

.tab-button:hover {
	color: #fff;
	background: #1e2124;
}

.tab-button.active {
	border-color: #8a5e12;
	color: #e9cf9f;
	background: #5a3806;
}

@media (max-width: 380px) {
	.app {
		padding-right: 6px;
		padding-left: 6px;
	}

	.header {
		height: 78px;
		padding-top: 16px;
	}
}
</style>
