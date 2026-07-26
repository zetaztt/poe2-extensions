import type { TradeStatPreset, TradeStatPresetQuery } from "@poe2-extensions/core/trade";
import { logPrefix } from "../trade-utils";

const statPresetScriptUrl = (document.currentScript as HTMLScriptElement | null)?.src;

export function cloneStatPresetQuery(query: TradeStatPresetQuery): TradeStatPresetQuery {
	return JSON.parse(JSON.stringify(query)) as TradeStatPresetQuery;
}

export function getCurrentStatGroupQuery(index: number): TradeStatPresetQuery | null {
	const stats = window.app?.query?.query?.stats;
	const query = stats?.[index];

	if (!query) {
		console.warn(`${logPrefix} 筛选预设保存失败：未找到当前筛选组`, { index });
		return null;
	}

	return query;
}

export function applyStatPreset(preset: TradeStatPreset): void {
	try {
		window.app?.$store.commit("pushStatGroup", cloneStatPresetQuery(preset.query));
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设应用失败`, error);
	}
}

const styleId = "poe2-extensions-stat-preset-style";

export function installStatPresetStyle(): void {
	if (document.getElementById(styleId)) return;
	if (!statPresetScriptUrl) {
		console.warn(`${logPrefix} 筛选预设样式加载失败：无法确定扩展资源地址`);
		return;
	}

	const link = document.createElement("link");
	link.id = styleId;
	link.rel = "stylesheet";
	link.href = new URL("trade-stat-preset-style.css", statPresetScriptUrl).href;

	document.documentElement.appendChild(link);
}

export function removeStatPresetStyle(): void {
	document.getElementById(styleId)?.remove();
}
