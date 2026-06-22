import { logPrefix } from "../trade-utils";
import type { TradeStatPreset, TradeStatPresetQuery } from "../trade-types";
import statPresetStyle from "./trade-stat-preset-style.css?raw";

export function ensureBodyReady(callback: () => void): void {
	if (document.body) {
		callback();
		return;
	}

	document.addEventListener("DOMContentLoaded", callback, {
		once: true,
	});
}

export function createRequestId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `stat-preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

	const style = document.createElement("style");
	style.id = styleId;
	style.textContent = statPresetStyle;

	document.documentElement.appendChild(style);
}

export function removeStatPresetStyle(): void {
	document.getElementById(styleId)?.remove();
}
