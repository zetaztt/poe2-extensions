import { ipcMain, ipcWindow } from "../../ipc/ipc";
import { createMainWorldIpcMain, createMainWorldIpcWindow } from "../../ipc/main-world-ipc-implementations";
import { tradeIpcProtocol } from "../trade-ipc-protocol";
import { getTradeSearchItemById, logPrefix } from "../trade-utils";
import { formatTradeItemText } from "./trade-item-code-format";

const itemCopyBoundKey = "poeItemCopyBound";
const itemCopyOriginalClassKey = "poeItemCopyOriginalClass";
const itemCopyOriginalStyleKey = "poeItemCopyOriginalStyle";

let enabled = false;
let observer: MutationObserver | null = null;
// 初始化 RPC 与侧边栏即时通知可能并发；一旦收到通知，就不能再用较旧的初始值覆盖它。
let hasReceivedItemCopyUpdate = false;
ipcMain.register(createMainWorldIpcMain);
ipcWindow.register(createMainWorldIpcWindow);

export function injectTradeItemCopy(): void {
	if (window.location.hostname !== "www.pathofexile.com" || !window.location.pathname.startsWith("/trade2")) {
		return;
	}

	ipcWindow.on(tradeIpcProtocol.itemCopyUpdated, ({ enabled }) => {
		hasReceivedItemCopyUpdate = true;
		setTradeItemCopyEnabled(enabled);
	});
	void initializeTradeItemCopy();
}

async function initializeTradeItemCopy(): Promise<void> {
	try {
		const initialEnabled = await ipcMain.invoke(tradeIpcProtocol.getTradeItemCopyEnabled);
		if (!hasReceivedItemCopyUpdate) setTradeItemCopyEnabled(initialEnabled);
	} catch (error) {
		console.warn(`${logPrefix} 复制物品文本初始状态读取失败`, error);
	}
}

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

injectTradeItemCopy();
