import { settingsIpcProtocol, type SettingValueSnapshot } from "@poe2-extensions/core/settings";
import { tradeSettings } from "@poe2-extensions/core/trade";
import { ipcMain } from "../../inject-ipc-channels";
import { bootstrapInjectScript } from "../../inject-script";
import { getTradeSearchItemById, logPrefix } from "../trade-utils";
import { formatTradeItemText } from "./trade-item-code-format";

const itemCopyBoundKey = "poeItemCopyBound";
const itemCopyOriginalClassKey = "poeItemCopyOriginalClass";
const itemCopyOriginalStyleKey = "poeItemCopyOriginalStyle";

let enabled = false;
let observer: MutationObserver | null = null;
// 初始化 RPC 与通用设置通知可能并发；按 worker 实例和 revision 拒绝过期快照。
let itemCopySettingsInstanceId: string | null = null;
let itemCopySettingsRevision = -1;
const retiredItemCopySettingsInstanceIds = new Set<string>();

async function initializeTradeItemCopy(): Promise<void> {
	try {
		const snapshot = await ipcMain.invoke(settingsIpcProtocol.get, {
			key: tradeSettings.itemCopy.key,
			defaultValue: tradeSettings.itemCopy.defaultValue,
		});
		applyItemCopySettingSnapshot(snapshot);
	} catch (error) {
		console.warn(`${logPrefix} 复制物品文本初始状态读取失败`, error);
	}
}

/**
 * 应用 itemCopy 的权威设置快照，并隔离 service worker 重启前后可能乱序到达的广播。
 */
function applyItemCopySettingSnapshot(snapshot: SettingValueSnapshot): void {
	if (snapshot.key !== tradeSettings.itemCopy.key) return;
	if (retiredItemCopySettingsInstanceIds.has(snapshot.instanceId)) return;

	if (snapshot.instanceId !== itemCopySettingsInstanceId) {
		if (itemCopySettingsInstanceId) retiredItemCopySettingsInstanceIds.add(itemCopySettingsInstanceId);
		itemCopySettingsInstanceId = snapshot.instanceId;
		itemCopySettingsRevision = -1;
	}

	if (snapshot.revision < itemCopySettingsRevision) return;
	itemCopySettingsRevision = snapshot.revision;
	setTradeItemCopyEnabled(snapshot.value as boolean);
}

/**
 * 即时切换物品复制增强；关闭时移除扩展监听与样式并恢复官方按钮行为。
 */
export function setTradeItemCopyEnabled(nextEnabled: boolean): void {
	if (enabled === nextEnabled) {
		refreshTradeItemCopyButtons();
		return;
	}

	enabled = nextEnabled;
	ensureTradeItemCopyObserver();
	refreshTradeItemCopyButtons();
}

function ensureTradeItemCopyObserver(): void {
	if (observer) return;
	if (!document.body) {
		document.addEventListener(
			"DOMContentLoaded",
			() => {
				ensureTradeItemCopyObserver();
				if (enabled) refreshTradeItemCopyButtons();
			},
			{ once: true },
		);
		return;
	}

	observer = new MutationObserver((mutations) => {
		if (!enabled) return;

		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (!(node instanceof HTMLElement)) continue;

				if (isTradeRow(node)) {
					bindTradeRow(node);
					continue;
				}

				for (const row of node.querySelectorAll<HTMLElement>("div.row[data-id]")) {
					bindTradeRow(row);
				}
			}
		}
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}

function refreshTradeItemCopyButtons(): void {
	for (const row of document.querySelectorAll<HTMLElement>("div.row[data-id]")) {
		if (enabled) {
			bindTradeRow(row);
		} else {
			unbindTradeRow(row);
		}
	}
}

function bindTradeRow(row: HTMLElement): void {
	const button = getTradeRowCopyButton(row);
	if (!button) return;
	if (button.dataset[itemCopyBoundKey] === "true") return;

	button.dataset[itemCopyBoundKey] = "true";
	button.dataset[itemCopyOriginalClassKey] = button.className;
	button.dataset[itemCopyOriginalStyleKey] = button.getAttribute("style") ?? "";
	button.className = "copy";
	button.removeAttribute("style");
	button.addEventListener("click", handleTradeRowCopyClick, true);
}

function unbindTradeRow(row: HTMLElement): void {
	const button = getTradeRowCopyButton(row);
	if (!button || button.dataset[itemCopyBoundKey] !== "true") return;

	button.removeEventListener("click", handleTradeRowCopyClick, true);
	button.className = button.dataset[itemCopyOriginalClassKey] ?? "";

	const originalStyle = button.dataset[itemCopyOriginalStyleKey];
	if (originalStyle) {
		button.setAttribute("style", originalStyle);
	} else {
		button.removeAttribute("style");
	}

	delete button.dataset[itemCopyBoundKey];
	delete button.dataset[itemCopyOriginalClassKey];
	delete button.dataset[itemCopyOriginalStyleKey];
}

function handleTradeRowCopyClick(event: MouseEvent): void {
	const button = event.currentTarget;
	if (!(button instanceof HTMLElement)) return;

	const row = button.closest<HTMLElement>("div.row[data-id]");
	if (!row) return;

	event.preventDefault();
	event.stopImmediatePropagation();
	void copyTradeRowItem(row);
}

async function copyTradeRowItem(row: HTMLElement): Promise<void> {
	const itemId = row.dataset.id;
	if (!itemId) return;

	const item = getTradeSearchItemById(itemId);
	if (!item) {
		console.warn(`${logPrefix} 未找到物品数据`, { itemId });
		return;
	}

	try {
		const outputText = formatTradeItemText(item);
		await navigator.clipboard.writeText(outputText);
		console.debug(`${logPrefix} 已复制物品文本`, { itemId, item });
	} catch (error) {
		console.error(`${logPrefix} 复制物品文本失败`, error);
	}
}

function getTradeRowCopyButton(row: HTMLElement): HTMLElement | null {
	const left = row.querySelector("div.left");
	const button = left?.children.item(1);
	return button instanceof HTMLElement ? button : null;
}

function isTradeRow(node: HTMLElement): boolean {
	return node.matches("div.row[data-id]");
}

bootstrapInjectScript(() => {
	if (window.location.hostname !== "www.pathofexile.com" || !window.location.pathname.startsWith("/trade2")) {
		return;
	}

	ipcMain.on(settingsIpcProtocol.onChanged, applyItemCopySettingSnapshot);
	void initializeTradeItemCopy();
});
