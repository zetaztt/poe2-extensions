<script lang="ts" setup>
import browser from "webextension-polyfill";
import { computed, onMounted, ref } from "vue";
import {
	getTradeItemCopyEnabled,
	getTradeStatPresetEnabled,
	getTradeTranslateEnabled,
	setTradeItemCopyEnabled,
	setTradeStatPresetEnabled,
	setTradeTranslateEnabled,
} from "../../settings";
import {
	createTradeItemCopyUpdateMessage,
	createTradeStatPresetUpdateMessage,
	createTradeSyncTranslateInjectionMessage,
} from "../../trade/trade-messages";

enum TradeSettingToggleType {
	Translate = 1,
	ItemCopy = 2,
	StatPreset = 3,
}

const tradeTranslateEnabled = ref(false);
const tradeItemCopyEnabled = ref(false);
const tradeStatPresetEnabled = ref(false);
const isLoadingSettings = ref(true);
const isSavingSettings = ref(false);
const settingsStatusText = ref("");

const statusLabel = computed(() => {
	const translate = tradeTranslateEnabled.value ? "翻译已开启" : "翻译已关闭";
	const itemCopy = tradeItemCopyEnabled.value ? "复制已开启" : "复制已关闭";
	const statPreset = tradeStatPresetEnabled.value ? "预设已开启" : "预设已关闭";
	return `${translate}，${itemCopy}，${statPreset}`;
});

onMounted(() => {
	void loadSettings();
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

function onCheckboxChange(event: Event, type: TradeSettingToggleType): void {
	const input = event.target as HTMLInputElement;
	if (type === TradeSettingToggleType.Translate) {
		void onTranslateToggle(input.checked);
		return;
	}

	if (type === TradeSettingToggleType.ItemCopy) {
		void onItemCopyToggle(input.checked);
		return;
	}

	void onStatPresetToggle(input.checked);
}

async function onTranslateToggle(nextValue: boolean): Promise<void> {
	const previousValue = tradeTranslateEnabled.value;
	tradeTranslateEnabled.value = nextValue;
	isSavingSettings.value = true;
	settingsStatusText.value = "";

	try {
		await setTradeTranslateEnabled(nextValue);
		await browser.runtime.sendMessage(createTradeSyncTranslateInjectionMessage());
		const reloaded = await reloadActiveTradeTab();
		settingsStatusText.value = reloaded
			? "设置已保存，trade2 页面已刷新。"
			: "设置已保存，打开或刷新 trade2 页面后生效。";
	} catch (error) {
		tradeTranslateEnabled.value = previousValue;
		settingsStatusText.value = "设置保存失败，请稍后重试。";
		console.error("[poe2-extensions] 中文翻译设置保存失败", error);
	} finally {
		isSavingSettings.value = false;
	}
}

async function onItemCopyToggle(nextValue: boolean): Promise<void> {
	const previousValue = tradeItemCopyEnabled.value;
	tradeItemCopyEnabled.value = nextValue;
	isSavingSettings.value = true;
	settingsStatusText.value = "";

	try {
		await setTradeItemCopyEnabled(nextValue);
		const updated = await updateActiveTradeTabItemCopy();
		settingsStatusText.value = updated
			? "设置已保存，trade2 页面已更新。"
			: "设置已保存，打开或刷新 trade2 页面后生效。";
	} catch (error) {
		tradeItemCopyEnabled.value = previousValue;
		settingsStatusText.value = "设置保存失败，请稍后重试。";
		console.error("[poe2-extensions] 复制物品文本设置保存失败", error);
	} finally {
		isSavingSettings.value = false;
	}
}

async function onStatPresetToggle(nextValue: boolean): Promise<void> {
	const previousValue = tradeStatPresetEnabled.value;
	tradeStatPresetEnabled.value = nextValue;
	isSavingSettings.value = true;
	settingsStatusText.value = "";

	try {
		await setTradeStatPresetEnabled(nextValue);
		const updated = await updateActiveTradeTabStatPreset();
		settingsStatusText.value = updated
			? "设置已保存，trade2 页面已更新。"
			: "设置已保存，打开或刷新 trade2 页面后生效。";
	} catch (error) {
		tradeStatPresetEnabled.value = previousValue;
		settingsStatusText.value = "设置保存失败，请稍后重试。";
		console.error("[poe2-extensions] 筛选预设保存设置保存失败", error);
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

async function updateActiveTradeTabItemCopy(): Promise<boolean> {
	return sendActiveTradeTabMessage(createTradeItemCopyUpdateMessage(tradeItemCopyEnabled.value));
}

async function updateActiveTradeTabStatPreset(): Promise<boolean> {
	return sendActiveTradeTabMessage(createTradeStatPresetUpdateMessage(tradeStatPresetEnabled.value));
}

async function sendActiveTradeTabMessage(message: unknown): Promise<boolean> {
	const [tab] = await browser.tabs.query({
		active: true,
		currentWindow: true,
	});

	if (!tab?.id || !isTrade2Url(tab.url)) return false;

	try {
		await browser.tabs.sendMessage(tab.id, message);
		return true;
	} catch (error) {
		console.warn("[poe2-extensions] trade2 页面设置同步失败", error);
		return false;
	}
}

function isTrade2Url(url: string | undefined): boolean {
	if (!url) return false;

	try {
		const parsedUrl = new URL(url);
		return parsedUrl.origin === "https://www.pathofexile.com" && parsedUrl.pathname.startsWith("/trade2");
	} catch {
		return false;
	}
}
</script>

<template>
	<section class="tab-content">
		<section class="panel">
			<label class="setting-row">
				<span>
					<span class="setting-title">中文翻译</span>
					<span class="setting-description">控制 trade2 页面数据和物品文本中文化</span>
				</span>

				<input
					class="switch-input"
					type="checkbox"
					:checked="tradeTranslateEnabled"
					:disabled="isLoadingSettings || isSavingSettings"
					@change="onCheckboxChange($event, TradeSettingToggleType.Translate)" />
				<span class="switch" aria-hidden="true"></span>
			</label>

			<label class="setting-row">
				<span>
					<span class="setting-title">复制物品文本</span>
					<span class="setting-description">将 trade2 物品复制为 PoB 文本</span>
				</span>

				<input
					class="switch-input"
					type="checkbox"
					:checked="tradeItemCopyEnabled"
					:disabled="isLoadingSettings || isSavingSettings"
					@change="onCheckboxChange($event, TradeSettingToggleType.ItemCopy)" />
				<span class="switch" aria-hidden="true"></span>
			</label>

			<label class="setting-row">
				<span>
					<span class="setting-title">筛选预设保存</span>
					<span class="setting-description">保存和复用 trade2 高级筛选 stat group</span>
				</span>

				<input
					class="switch-input"
					type="checkbox"
					:checked="tradeStatPresetEnabled"
					:disabled="isLoadingSettings || isSavingSettings"
					@change="onCheckboxChange($event, TradeSettingToggleType.StatPreset)" />
				<span class="switch" aria-hidden="true"></span>
			</label>

			<div class="status">
				<span
					class="status-dot"
					:class="{ active: tradeTranslateEnabled || tradeItemCopyEnabled || tradeStatPresetEnabled }"></span>
				<span>{{ isLoadingSettings ? "读取设置中" : statusLabel }}</span>
			</div>

			<p v-if="settingsStatusText" class="message">{{ settingsStatusText }}</p>
		</section>

		<section class="panel muted">
			<h2>字典来源</h2>
			<a href="https://zetaztt.github.io/poe2-extensions/translate.json" target="_blank"> translate.json </a>
		</section>
	</section>
</template>

<style scoped>
.tab-content {
	display: grid;
	gap: 0;
	padding: 8px;
	background: #000;
}

.panel {
	border: 0;
	border-radius: 0;
	background: #000;
}

.panel + .panel {
	margin-top: 8px;
}

h2,
p {
	margin: 0;
}

h2 {
	padding: 5px 2px;
	border-bottom: 1px solid #4a4a4a;
	color: #e2e2e2;
	background: #000;
	font-family: FontinSmallCaps, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	font-weight: 400;
}

.setting-description,
.message,
.muted {
	color: var(--color-text);
}

.setting-description {
	display: block;
	margin-top: 3px;
	font-size: 11px;
	line-height: 1.35;
}

.setting-row {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	min-height: 48px;
	padding: 6px 10px;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	border-bottom-color: #000;
	background: #101112;
	cursor: pointer;
}

.setting-row:hover {
	background: #151719;
}

.setting-row > span:first-child {
	min-width: 0;
}

.setting-title {
	display: block;
	color: var(--color-text-secondary);
	font-size: 14px;
	font-weight: 400;
}

.switch-input {
	position: absolute;
	opacity: 0;
	pointer-events: none;
}

.switch {
	position: relative;
	flex: 0 0 auto;
	width: 84px;
	height: 32px;
	border: 1px solid #333;
	border-radius: 0;
	background: #1e2124;
}

.switch::after {
	display: grid;
	height: 100%;
	place-items: center;
	color: #9d9d9d;
	content: "关闭";
	font-size: 13px;
}

.switch-input:checked + .switch {
	border-color: #8a5e12;
	background: #684200;
}

.switch-input:checked + .switch::after {
	color: #fff;
	content: "开启";
}

.switch-input:disabled + .switch {
	opacity: 0.6;
}

.status {
	display: flex;
	align-items: center;
	gap: 8px;
	min-height: 34px;
	padding: 6px 10px;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	color: #dcdcdc;
	background: #1e2124;
	font-size: 12px;
}

.status-dot {
	width: 12px;
	height: 12px;
	border: 1px solid #4a4a4a;
	border-radius: 0;
	background: #111;
}

.status-dot.active {
	border-color: #a38d6d;
	background: #a38d6d;
	box-shadow: none;
}

.message {
	padding: 8px 10px;
	border: 1px solid #333;
	font-size: 11px;
	line-height: 1.4;
}

a {
	display: block;
	padding: 8px 10px;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	color: #43a2e6;
	background: #1e2124;
	text-decoration: none;
}

a:hover {
	color: var(--color-text-secondary);
	text-decoration: underline;
}
</style>
