<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import {
	getTradeItemCopyEnabled,
	getTradeStatPresetEnabled,
	getTradeTranslateEnabled,
	setTradeItemCopyEnabled,
	setTradeStatPresetEnabled,
	setTradeTranslateEnabled,
} from '@/settings/settings';
import { createTradeFeaturesUpdateMessage } from '@/trade/messages';

const tradeTranslateEnabled = ref(false);
const tradeItemCopyEnabled = ref(false);
const tradeStatPresetEnabled = ref(false);
const isLoadingSettings = ref(true);
const isSavingSettings = ref(false);
const settingsStatusText = ref('');

const statusLabel = computed(() => {
	const translate = tradeTranslateEnabled.value ? '翻译已开启' : '翻译已关闭';
	const itemCopy = tradeItemCopyEnabled.value ? '复制已开启' : '复制已关闭';
	const statPreset = tradeStatPresetEnabled.value ? '预设已开启' : '预设已关闭';
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

function onCheckboxChange(event: Event, type: 'translate' | 'itemCopy' | 'statPreset'): void {
	const input = event.target as HTMLInputElement;
	if (type === 'translate') {
		void onTranslateToggle(input.checked);
		return;
	}

	if (type === 'itemCopy') {
		void onItemCopyToggle(input.checked);
		return;
	}

	void onStatPresetToggle(input.checked);
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
					@change="onCheckboxChange($event, 'translate')"
				>
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
					@change="onCheckboxChange($event, 'itemCopy')"
				>
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
					@change="onCheckboxChange($event, 'statPreset')"
				>
				<span class="switch" aria-hidden="true"></span>
			</label>

			<div class="status">
				<span class="status-dot" :class="{ active: tradeTranslateEnabled || tradeItemCopyEnabled || tradeStatPresetEnabled }"></span>
				<span>{{ isLoadingSettings ? '读取设置中' : statusLabel }}</span>
			</div>

			<p v-if="settingsStatusText" class="message">{{ settingsStatusText }}</p>
		</section>

		<section class="panel muted">
			<h2>字典来源</h2>
			<a href="https://zetaztt.github.io/poe2/translate.json" target="_blank">
				translate.json
			</a>
		</section>
	</section>
</template>

<style scoped>
.tab-content {
	display: grid;
	gap: 12px;
}

.panel {
	padding: 14px;
	border: 1px solid #3b3024;
	border-radius: 8px;
	background: #211a13;
}

.panel + .panel {
	margin-top: 12px;
}

h2,
p {
	margin: 0;
}

h2 {
	font-size: 16px;
}

.setting-description,
.message,
.muted {
	color: #c9bba7;
}

.setting-description {
	display: block;
	margin-top: 6px;
	font-size: 13px;
	line-height: 1.5;
}

.setting-row {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	cursor: pointer;
}

.setting-row + .setting-row {
	margin-top: 14px;
}

.setting-title {
	display: block;
	font-size: 16px;
	font-weight: 700;
}

.switch-input {
	position: absolute;
	opacity: 0;
	pointer-events: none;
}

.switch {
	position: relative;
	flex: 0 0 auto;
	width: 46px;
	height: 26px;
	border: 1px solid #5c4c3a;
	border-radius: 999px;
	background: #33271c;
	transition: background 160ms ease, border-color 160ms ease;
}

.switch::after {
	position: absolute;
	top: 3px;
	left: 3px;
	width: 18px;
	height: 18px;
	border-radius: 50%;
	background: #c9bba7;
	content: '';
	transition: transform 160ms ease, background 160ms ease;
}

.switch-input:checked + .switch {
	border-color: #d7a85f;
	background: #6f5124;
}

.switch-input:checked + .switch::after {
	transform: translateX(20px);
	background: #f4efe4;
}

.switch-input:disabled + .switch {
	opacity: 0.6;
}

.status {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 14px;
	color: #c9bba7;
	font-size: 13px;
}

.status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #72533c;
}

.status-dot.active {
	background: #d7a85f;
}

.message {
	margin-top: 10px;
	font-size: 13px;
	line-height: 1.5;
}

a {
	display: inline-block;
	margin-top: 10px;
	color: #d7a85f;
}
</style>
