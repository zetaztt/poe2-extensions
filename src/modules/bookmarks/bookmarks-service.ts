import browser from "webextension-polyfill";
import { ipcMain } from "../../ipc/ipc";
import { bookmarksIpcProtocol } from "./bookmarks-ipc-protocol";
import {
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

function loadTradeBookmarks(): Promise<TradeBookmarkTreeSnapshot> {
	return ipcMain.invoke(bookmarksIpcProtocol.load);
}

function getTradeBookmarkRootGroups(): Promise<TradeBookmarkGroup[]> {
	return ipcMain.invoke(bookmarksIpcProtocol.getRootGroups);
}

function getTradeBookmarkRootTree(): Promise<TradeBookmarkRoot> {
	return ipcMain.invoke(bookmarksIpcProtocol.getRootTree);
}

function createBookmarkFolder(
	parentId: string,
	title: string,
): Promise<TradeBookmarkChangeResult<BookmarkFolderOption>> {
	return ipcMain.invoke(bookmarksIpcProtocol.createFolder, { parentId, title });
}

function renameBookmarkFolder(
	folderId: string,
	title: string,
): Promise<TradeBookmarkChangeResult<BookmarkFolderOption>> {
	return ipcMain.invoke(bookmarksIpcProtocol.renameFolder, { folderId, title });
}

function deleteBookmarkFolder(folderId: string): Promise<TradeBookmarkChangeResult<null>> {
	return ipcMain.invoke(bookmarksIpcProtocol.deleteFolder, { folderId });
}

function moveBookmarkFolder(
	folderId: string,
	targetParentId: string,
	targetIndex: number,
): Promise<TradeBookmarkChangeResult<null>> {
	return ipcMain.invoke(bookmarksIpcProtocol.moveFolder, { folderId, targetParentId, targetIndex });
}

function getTradeBookmarkGroups(folderId: string): Promise<TradeBookmarkGroup[]> {
	return ipcMain.invoke(bookmarksIpcProtocol.getGroups, { folderId });
}

function getTradeBookmarkTree(folderId: string): Promise<TradeBookmarkRoot | TradeBookmarkFolder | null> {
	return ipcMain.invoke(bookmarksIpcProtocol.getTree, { folderId });
}

async function addCurrentTradeSearchBookmark(folderId: string): Promise<TradeBookmarkChangeResult<TradeBookmarkItem>> {
	const tab = await getActiveTab();
	if (!tab?.url || !isTrade2Url(tab.url)) throw new Error("当前活动标签页不是 trade2 搜索页");
	return ipcMain.invoke(bookmarksIpcProtocol.addCurrentSearch, {
		folderId,
		title: tab.title,
		url: tab.url,
	});
}

function renameTradeBookmark(bookmarkId: string, title: string): Promise<TradeBookmarkChangeResult<TradeBookmarkItem>> {
	return ipcMain.invoke(bookmarksIpcProtocol.renameBookmark, { bookmarkId, title });
}

function deleteTradeBookmark(bookmarkId: string): Promise<TradeBookmarkChangeResult<null>> {
	return ipcMain.invoke(bookmarksIpcProtocol.deleteBookmark, { bookmarkId });
}

function moveTradeBookmark(
	bookmarkId: string,
	targetFolderId: string,
	targetIndex: number,
): Promise<TradeBookmarkChangeResult<null>> {
	return ipcMain.invoke(bookmarksIpcProtocol.moveBookmark, { bookmarkId, targetFolderId, targetIndex });
}

async function replaceTradeBookmarkWithCurrentSearch(
	bookmarkId: string,
): Promise<TradeBookmarkChangeResult<TradeBookmarkItem>> {
	const tab = await getActiveTab();
	if (!tab?.url || !isTrade2Url(tab.url)) throw new Error("当前活动标签页不是 trade2 搜索页");
	return ipcMain.invoke(bookmarksIpcProtocol.replaceBookmark, { bookmarkId, url: tab.url });
}

function exportBookmarkTree(): Promise<TradeBookmarkExportData> {
	return ipcMain.invoke(bookmarksIpcProtocol.exportTree);
}

function exportBookmarkFolder(folderId: string): Promise<TradeBookmarkExportData> {
	return ipcMain.invoke(bookmarksIpcProtocol.exportFolder, { folderId });
}

function importBookmarkData(value: unknown): Promise<TradeBookmarkChangeResult<null>> {
	return ipcMain.invoke(bookmarksIpcProtocol.importData, { value });
}

async function openTradeBookmark(url: string): Promise<void> {
	const tab = await getActiveTab();
	if (tab?.id && isTrade2Url(tab.url)) {
		await browser.tabs.update(tab.id, { url });
		return;
	}

	await browser.tabs.create({ url });
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

function getTradeBookmarkServiceErrorMessage(code: TradeBookmarkServiceErrorCode): string {
	return tradeBookmarkServiceErrorMessages[code];
}

function subscribeTradeBookmarks(
	onChanged: (snapshot: TradeBookmarkTreeSnapshot) => void,
	onPersistenceFailed: (error: TradeBookmarkPersistenceError) => void,
): () => void {
	const unsubscribeChanged = ipcMain.on(bookmarksIpcProtocol.changed, onChanged);
	const unsubscribePersistenceFailed = ipcMain.on(bookmarksIpcProtocol.persistenceFailed, onPersistenceFailed);
	return () => {
		unsubscribeChanged();
		unsubscribePersistenceFailed();
	};
}

async function getActiveTab(): Promise<ActiveBrowserTab | undefined> {
	const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
	return tab;
}

export const tradeBookmarkService = {
	loadTradeBookmarks,
	getTradeBookmarkRootGroups,
	getTradeBookmarkRootTree,
	createBookmarkFolder,
	renameBookmarkFolder,
	deleteBookmarkFolder,
	moveBookmarkFolder,
	getTradeBookmarkGroups,
	getTradeBookmarkTree,
	addCurrentTradeSearchBookmark,
	renameTradeBookmark,
	deleteTradeBookmark,
	moveTradeBookmark,
	replaceTradeBookmarkWithCurrentSearch,
	exportBookmarkTree,
	exportBookmarkFolder,
	importBookmarkData,
	openTradeBookmark,
	isTrade2Url,
	getTradeBookmarkServiceErrorMessage,
	subscribeTradeBookmarks,
};
