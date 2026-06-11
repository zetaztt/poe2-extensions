<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { getTradeItemCopyEnabled, getTradeTranslateEnabled, setTradeItemCopyEnabled, setTradeTranslateEnabled } from '@/src/settings';
import { createTradeFeaturesUpdateMessage } from '@/src/trade/messages';

const tradeTranslateEnabled = ref(false);
const tradeItemCopyEnabled = ref(false);
const isLoading = ref(true);
const isSaving = ref(false);
const statusText = ref('');

const statusLabel = computed(() => {
	const translate = tradeTranslateEnabled.value ? '翻译已开启' : '翻译已关闭';
	const itemCopy = tradeItemCopyEnabled.value ? '复制已开启' : '复制已关闭';
	return `${translate}，${itemCopy}`;
});

onMounted(async () => {
	const [translateEnabled, itemCopyEnabled] = await Promise.all([
		getTradeTranslateEnabled(),
		getTradeItemCopyEnabled(),
	]);

	tradeTranslateEnabled.value = translateEnabled;
	tradeItemCopyEnabled.value = itemCopyEnabled;
	isLoading.value = false;
});

async function onTranslateToggle(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement;
	const nextValue = input.checked;
	const previousValue = tradeTranslateEnabled.value;

	tradeTranslateEnabled.value = nextValue;
	isSaving.value = true;
	statusText.value = '';

	try {
		await setTradeTranslateEnabled(nextValue);
		const reloaded = await reloadActiveTradeTab();
		statusText.value = reloaded ? '设置已保存，trade2 页面已刷新。' : '设置已保存，打开或刷新 trade2 页面后生效。';
	} catch (error) {
		tradeTranslateEnabled.value = previousValue;
		statusText.value = '设置保存失败，请稍后重试。';
		console.error('[poe2-extensions] 中文翻译设置保存失败', error);
	} finally {
		isSaving.value = false;
	}
}

async function onItemCopyToggle(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement;
	const nextValue = input.checked;
	const previousValue = tradeItemCopyEnabled.value;

	tradeItemCopyEnabled.value = nextValue;
	isSaving.value = true;
	statusText.value = '';

	try {
		await setTradeItemCopyEnabled(nextValue);
		const updated = await updateActiveTradeTabFeatures();
		statusText.value = updated ? '设置已保存，trade2 页面已更新。' : '设置已保存，打开或刷新 trade2 页面后生效。';
	} catch (error) {
		tradeItemCopyEnabled.value = previousValue;
		statusText.value = '设置保存失败，请稍后重试。';
		console.error('[poe2-extensions] 复制物品文本设置保存失败', error);
	} finally {
		isSaving.value = false;
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
	<main class="app">
		<header class="header">
			<p class="eyebrow">POE2 Extensions</p>
			<h1>Trade 设置</h1>
		</header>

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
					:disabled="isLoading || isSaving"
					@change="onTranslateToggle"
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
					:disabled="isLoading || isSaving"
					@change="onItemCopyToggle"
				>
				<span class="switch" aria-hidden="true"></span>
			</label>

			<div class="status">
				<span class="status-dot" :class="{ active: tradeTranslateEnabled || tradeItemCopyEnabled }"></span>
				<span>{{ isLoading ? '读取设置中' : statusLabel }}</span>
			</div>

			<p v-if="statusText" class="message">{{ statusText }}</p>
		</section>

		<section class="panel muted">
			<h2>字典来源</h2>
			<a href="https://zetaztt.github.io/poe2/translate.json" target="_blank">
				translate.json
			</a>
		</section>
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
h2,
p {
	margin: 0;
}

h1 {
	font-size: 24px;
}

h2 {
	font-size: 16px;
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
