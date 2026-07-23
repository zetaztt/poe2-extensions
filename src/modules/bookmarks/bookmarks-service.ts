import browser from "webextension-polyfill";
import { ipcMain } from "../../ipc/ipc";
import { bookmarksIpcProtocol } from "./bookmarks-ipc-protocol";
import {
	rootFolderId,
	TradeBookmarkServiceErrorCode,
	type BookmarkFolderOption,
	type TradeBookmarkChangeResult,
	type TradeBookmarkExportData,
	type TradeBookmarkFolder,
	type TradeBookmarkGroup,
	type TradeBookmarkItem,
	type TradeBookmarkPersistenceError,
	type TradeBookmarkRoot,
	type TradeBookmarkTreeSnapshot,
} from "./bookmarks-types";

export { rootFolderId, TradeBookmarkServiceErrorCode };
export type {
	BookmarkFolderOption,
	TradeBookmarkFolder,
	TradeBookmarkGroup,
	TradeBookmarkItem,
	TradeBookmarkRoot,
} from "./bookmarks-types";

type ActiveBrowserTab = {
	id?: number;
	title?: string;
	url?: string;
};

const tradeBookmarkServiceErrorMessages: Record<TradeBookmarkServiceErrorCode, string> = {
	[TradeBookmarkServiceErrorCode.None]: "",
	[TradeBookmarkServiceErrorCode.LoadFailed]: "本地书签读取失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.CreateFolderFailed]: "新建文件夹失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.RenameFolderFailed]: "重命名文件夹失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.DeleteFolderFailed]: "删除文件夹失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.MoveFailed]: "移动失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.AddFailed]: "添加书签失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.RenameFailed]: "重命名书签失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.DeleteFailed]: "删除书签失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.ReplaceFailed]: "替换书签失败，请稍后重试。",
	[TradeBookmarkServiceErrorCode.PersistenceFailed]: "书签尚未保存到本地存储。",
};

export enum TradeBookmarkServiceEventType {
	Loaded = 1,
	Changed = 2,
	Error = 3,
}

export type TradeBookmarkServiceEvent =
	| { type: TradeBookmarkServiceEventType.Loaded; tree: TradeBookmarkRoot }
	| { type: TradeBookmarkServiceEventType.Changed; tree: TradeBookmarkRoot }
	| { type: TradeBookmarkServiceEventType.Error; code: TradeBookmarkServiceErrorCode; error: unknown };

let currentRootTree: TradeBookmarkRoot | null = null;
// background 重启后 revision 会归零，instanceId 用于把新生命周期与旧广播区分开。
let currentBackgroundInstanceId = "";
let currentBookmarkRevision = -1;
const retiredBackgroundInstanceIds = new Set<string>();
let isBookmarkServiceLoading = false;
let lastBookmarkServiceErrorCode = TradeBookmarkServiceErrorCode.None;
let areBookmarkNotificationsInstalled = false;
const listeners = new Set<(event: TradeBookmarkServiceEvent) => void>();

export function getCurrentTradeBookmarkTree(): TradeBookmarkRoot | null {
	return currentRootTree;
}

export function isTradeBookmarkServiceLoading(): boolean {
	return isBookmarkServiceLoading;
}

export function getTradeBookmarkServiceErrorCode(): TradeBookmarkServiceErrorCode {
	return lastBookmarkServiceErrorCode;
}

export function subscribeTradeBookmarks(listener: (event: TradeBookmarkServiceEvent) => void): () => void {
	ensureBookmarkNotificationsInstalled();
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export async function loadTradeBookmarks(): Promise<TradeBookmarkRoot> {
	ensureBookmarkNotificationsInstalled();
	isBookmarkServiceLoading = true;
	lastBookmarkServiceErrorCode = TradeBookmarkServiceErrorCode.None;

	try {
		const snapshot = await ipcMain.invoke(bookmarksIpcProtocol.load);
		return applyBookmarkSnapshot(snapshot, TradeBookmarkServiceEventType.Loaded, true);
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.LoadFailed, error);
		throw error;
	} finally {
		isBookmarkServiceLoading = false;
	}
}

export function getTradeBookmarkRootGroups(): Promise<TradeBookmarkGroup[]> {
	ensureBookmarkNotificationsInstalled();
	return ipcMain.invoke(bookmarksIpcProtocol.getRootGroups);
}

export function getTradeBookmarkRootTree(): Promise<TradeBookmarkRoot> {
	ensureBookmarkNotificationsInstalled();
	return ipcMain.invoke(bookmarksIpcProtocol.getRootTree);
}

export async function createBookmarkFolder(parentId: string, title: string): Promise<BookmarkFolderOption> {
	return runBookmarkMutation(TradeBookmarkServiceErrorCode.CreateFolderFailed, () =>
		ipcMain.invoke(bookmarksIpcProtocol.createFolder, { parentId, title }),
	);
}

export async function renameBookmarkFolder(folderId: string, title: string): Promise<BookmarkFolderOption> {
	return runBookmarkMutation(TradeBookmarkServiceErrorCode.RenameFolderFailed, () =>
		ipcMain.invoke(bookmarksIpcProtocol.renameFolder, { folderId, title }),
	);
}

export async function deleteBookmarkFolder(folderId: string): Promise<void> {
	await runBookmarkMutation(TradeBookmarkServiceErrorCode.DeleteFolderFailed, () =>
		ipcMain.invoke(bookmarksIpcProtocol.deleteFolder, { folderId }),
	);
}

export async function moveBookmarkFolder(folderId: string, targetParentId: string, targetIndex: number): Promise<void> {
	await runBookmarkMutation(TradeBookmarkServiceErrorCode.MoveFailed, () =>
		ipcMain.invoke(bookmarksIpcProtocol.moveFolder, { folderId, targetParentId, targetIndex }),
	);
}

export function getTradeBookmarkGroups(folderId: string): Promise<TradeBookmarkGroup[]> {
	ensureBookmarkNotificationsInstalled();
	return ipcMain.invoke(bookmarksIpcProtocol.getGroups, { folderId });
}

export function getTradeBookmarkTree(folderId: string): Promise<TradeBookmarkRoot | TradeBookmarkFolder | null> {
	ensureBookmarkNotificationsInstalled();
	return ipcMain.invoke(bookmarksIpcProtocol.getTree, { folderId });
}

export async function addCurrentTradeSearchBookmark(folderId: string): Promise<TradeBookmarkItem> {
	return runBookmarkMutation(TradeBookmarkServiceErrorCode.AddFailed, async () => {
		const tab = await getActiveTab();
		if (!tab?.url || !isTrade2Url(tab.url)) throw new Error("当前活动标签页不是 trade2 搜索页");
		return ipcMain.invoke(bookmarksIpcProtocol.addCurrentSearch, {
			folderId,
			title: tab.title,
			url: tab.url,
		});
	});
}

export async function renameTradeBookmark(bookmarkId: string, title: string): Promise<TradeBookmarkItem> {
	return runBookmarkMutation(TradeBookmarkServiceErrorCode.RenameFailed, () =>
		ipcMain.invoke(bookmarksIpcProtocol.renameBookmark, { bookmarkId, title }),
	);
}

export async function deleteTradeBookmark(bookmarkId: string): Promise<void> {
	await runBookmarkMutation(TradeBookmarkServiceErrorCode.DeleteFailed, () =>
		ipcMain.invoke(bookmarksIpcProtocol.deleteBookmark, { bookmarkId }),
	);
}

export async function moveTradeBookmark(
	bookmarkId: string,
	targetFolderId: string,
	targetIndex: number,
): Promise<void> {
	await runBookmarkMutation(TradeBookmarkServiceErrorCode.MoveFailed, () =>
		ipcMain.invoke(bookmarksIpcProtocol.moveBookmark, { bookmarkId, targetFolderId, targetIndex }),
	);
}

export async function replaceTradeBookmarkWithCurrentSearch(bookmarkId: string): Promise<TradeBookmarkItem> {
	return runBookmarkMutation(TradeBookmarkServiceErrorCode.ReplaceFailed, async () => {
		const tab = await getActiveTab();
		if (!tab?.url || !isTrade2Url(tab.url)) throw new Error("当前活动标签页不是 trade2 搜索页");
		return ipcMain.invoke(bookmarksIpcProtocol.replaceBookmark, { bookmarkId, url: tab.url });
	});
}

export function exportBookmarkTree(): Promise<TradeBookmarkExportData> {
	ensureBookmarkNotificationsInstalled();
	return ipcMain.invoke(bookmarksIpcProtocol.exportTree);
}

export function exportBookmarkFolder(folderId: string): Promise<TradeBookmarkExportData> {
	ensureBookmarkNotificationsInstalled();
	return ipcMain.invoke(bookmarksIpcProtocol.exportFolder, { folderId });
}

export async function importBookmarkData(value: unknown): Promise<void> {
	ensureBookmarkNotificationsInstalled();
	const result = await ipcMain.invoke(bookmarksIpcProtocol.importData, { value });
	applyBookmarkSnapshot(result, TradeBookmarkServiceEventType.Changed);
}

export async function openTradeBookmark(url: string): Promise<void> {
	const tab = await getActiveTab();
	if (tab?.id && isTrade2Url(tab.url)) {
		await browser.tabs.update(tab.id, { url });
		return;
	}

	await browser.tabs.create({ url });
}

export function isTrade2Url(url: string | undefined): boolean {
	if (!url) return false;

	try {
		const parsedUrl = new URL(url);
		return parsedUrl.origin === "https://www.pathofexile.com" && parsedUrl.pathname.startsWith("/trade2");
	} catch {
		return false;
	}
}

export function getTradeBookmarkServiceErrorMessage(code: TradeBookmarkServiceErrorCode): string {
	return tradeBookmarkServiceErrorMessages[code];
}

async function runBookmarkMutation<T>(
	errorCode: TradeBookmarkServiceErrorCode,
	invoke: () => Promise<TradeBookmarkChangeResult<T>>,
): Promise<T> {
	ensureBookmarkNotificationsInstalled();

	try {
		const result = await invoke();
		applyBookmarkSnapshot(result, TradeBookmarkServiceEventType.Changed);
		return result.value;
	} catch (error) {
		publishTradeBookmarkError(errorCode, error);
		throw error;
	}
}

function ensureBookmarkNotificationsInstalled(): void {
	if (areBookmarkNotificationsInstalled) return;
	areBookmarkNotificationsInstalled = true;
	ipcMain.on(bookmarksIpcProtocol.changed, (snapshot) => {
		applyBookmarkSnapshot(snapshot, TradeBookmarkServiceEventType.Changed);
	});
	ipcMain.on(bookmarksIpcProtocol.persistenceFailed, onBookmarkPersistenceFailed);
}

function applyBookmarkSnapshot(
	snapshot: TradeBookmarkTreeSnapshot,
	type: TradeBookmarkServiceEventType.Loaded | TradeBookmarkServiceEventType.Changed,
	force = false,
): TradeBookmarkRoot {
	if (retiredBackgroundInstanceIds.has(snapshot.instanceId)) return currentRootTree ?? snapshot.tree;

	const isNewBackgroundInstance = snapshot.instanceId !== currentBackgroundInstanceId;
	const isNewerRevision = snapshot.revision > currentBookmarkRevision;
	const isOlderRevision = snapshot.revision < currentBookmarkRevision;
	if (!isNewBackgroundInstance && isOlderRevision) return currentRootTree ?? snapshot.tree;
	if (!force && !isNewBackgroundInstance && !isNewerRevision) return currentRootTree ?? snapshot.tree;

	if (isNewBackgroundInstance || isNewerRevision || !currentRootTree) {
		if (isNewBackgroundInstance && currentBackgroundInstanceId) {
			retiredBackgroundInstanceIds.add(currentBackgroundInstanceId);
		}
		currentBackgroundInstanceId = snapshot.instanceId;
		currentBookmarkRevision = snapshot.revision;
		currentRootTree = snapshot.tree;
	}
	lastBookmarkServiceErrorCode = TradeBookmarkServiceErrorCode.None;
	publishTradeBookmarkEvent({ type, tree: currentRootTree });
	return currentRootTree;
}

function onBookmarkPersistenceFailed(error: TradeBookmarkPersistenceError): void {
	if (currentBackgroundInstanceId && error.instanceId !== currentBackgroundInstanceId) return;
	publishTradeBookmarkError(TradeBookmarkServiceErrorCode.PersistenceFailed, new Error(error.message));
}

function publishTradeBookmarkError(code: TradeBookmarkServiceErrorCode, error: unknown): void {
	lastBookmarkServiceErrorCode = code;
	publishTradeBookmarkEvent({ type: TradeBookmarkServiceEventType.Error, code, error });
}

function publishTradeBookmarkEvent(event: TradeBookmarkServiceEvent): void {
	for (const listener of listeners) {
		try {
			listener(event);
		} catch (error) {
			console.error("[poe2-extensions] trade 书签 service 事件处理失败", error);
		}
	}
}

async function getActiveTab(): Promise<ActiveBrowserTab | undefined> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	return tab;
}
