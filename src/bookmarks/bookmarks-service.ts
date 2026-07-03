import browser from "webextension-polyfill";
import { getBookmarkTree, rootFolderId, saveBookmarkTree } from "./bookmarks-storage";
import type {
	BookmarkFolderOption,
	StoredTradeBookmark,
	StoredTradeBookmarkFolder,
	StoredTradeBookmarkTree,
	TradeBookmarkFolder,
	TradeBookmarkGroup,
	TradeBookmarkItem,
	TradeBookmarkRoot,
} from "./bookmarks-types";

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

export enum TradeBookmarkServiceErrorCode {
	None = 0,
	LoadFailed = 1,
	CreateFolderFailed = 2,
	RenameFolderFailed = 3,
	DeleteFolderFailed = 4,
	MoveFailed = 5,
	AddFailed = 6,
	RenameFailed = 7,
	DeleteFailed = 8,
	ReplaceFailed = 9,
}

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
let isBookmarkServiceLoading = false;
let lastBookmarkServiceErrorCode = TradeBookmarkServiceErrorCode.None;
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
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export async function loadTradeBookmarks(): Promise<TradeBookmarkRoot> {
	isBookmarkServiceLoading = true;
	lastBookmarkServiceErrorCode = TradeBookmarkServiceErrorCode.None;

	try {
		return await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Loaded);
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.LoadFailed, error);
		throw error;
	} finally {
		isBookmarkServiceLoading = false;
	}
}

export async function getTradeBookmarkRootGroups(): Promise<TradeBookmarkGroup[]> {
	return getTradeBookmarkGroups(rootFolderId);
}

export async function getTradeBookmarkRootTree(): Promise<TradeBookmarkRoot> {
	const tree = await getBookmarkTree();
	return collectTradeBookmarkRoot(tree);
}

export async function createBookmarkFolder(parentId: string, title: string): Promise<BookmarkFolderOption> {
	try {
		if (parentId !== rootFolderId) throw new Error("只能在顶层创建一级文件夹");

		const tree = await getBookmarkTree();
		const now = Date.now();
		const folder: StoredTradeBookmarkFolder = {
			id: createId("folder"),
			title: normalizeFolderTitle(title),
			parentId,
			bookmarks: [],
			createdAt: now,
			updatedAt: now,
		};

		tree.root.folders.push(folder);
		tree.root.updatedAt = now;
		await saveBookmarkTree(tree);

		const option = toBookmarkFolderOption(folder);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
		return option;
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.CreateFolderFailed, error);
		throw error;
	}
}

export async function renameBookmarkFolder(folderId: string, title: string): Promise<BookmarkFolderOption> {
	try {
		const tree = await getBookmarkTree();
		const folder = findFolder(tree, folderId);
		if (!folder) throw new Error("未找到书签目录");
		assertModifiableFolder(folder);

		folder.title = normalizeFolderTitle(title);
		folder.updatedAt = Date.now();
		await saveBookmarkTree(tree);

		const option = toBookmarkFolderOption(folder);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
		return option;
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.RenameFolderFailed, error);
		throw error;
	}
}

export async function deleteBookmarkFolder(folderId: string): Promise<void> {
	try {
		const tree = await getBookmarkTree();
		const folder = findFolder(tree, folderId);
		if (!folder) throw new Error("未找到书签目录");
		assertModifiableFolder(folder);

		tree.root.folders = tree.root.folders.filter((item) => item.id !== folderId);
		tree.root.updatedAt = Date.now();
		await saveBookmarkTree(tree);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.DeleteFolderFailed, error);
		throw error;
	}
}

export async function moveBookmarkFolder(folderId: string, targetParentId: string, targetIndex: number): Promise<void> {
	try {
		if (targetParentId !== rootFolderId) throw new Error("文件夹只能保存在顶层");

		const tree = await getBookmarkTree();
		const currentIndex = tree.root.folders.findIndex((folder) => folder.id === folderId);
		if (currentIndex < 0) throw new Error("未找到书签目录");

		const [folder] = tree.root.folders.splice(currentIndex, 1);
		assertModifiableFolder(folder);
		const insertionIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
		folder.parentId = rootFolderId;
		folder.updatedAt = Date.now();
		tree.root.folders.splice(clampInsertionIndex(insertionIndex, tree.root.folders.length), 0, folder);
		tree.root.updatedAt = folder.updatedAt;

		await saveBookmarkTree(tree);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.MoveFailed, error);
		throw error;
	}
}

export async function getTradeBookmarkGroups(folderId: string): Promise<TradeBookmarkGroup[]> {
	const tree = await getBookmarkTree();
	if (folderId === rootFolderId) return collectTradeBookmarkGroups(tree.root.folders);

	const folder = findFolder(tree, folderId);
	if (!folder) return [];

	return collectTradeBookmarkGroups([folder]);
}

export async function getTradeBookmarkTree(folderId: string): Promise<TradeBookmarkRoot | TradeBookmarkFolder | null> {
	const tree = await getBookmarkTree();
	if (folderId === rootFolderId) return collectTradeBookmarkRoot(tree);

	const folder = findFolder(tree, folderId);
	return folder ? collectTradeBookmarkFolder(tree, folder) : null;
}

export async function addCurrentTradeSearchBookmark(folderId: string): Promise<TradeBookmarkItem> {
	try {
		const tab = await getActiveTab();
		if (!tab?.url || !isTrade2Url(tab.url)) {
			throw new Error("当前活动标签页不是 trade2 搜索页");
		}

		const tree = await getBookmarkTree();
		const folder = findFolder(tree, folderId);
		if (!folder) throw new Error("未找到书签目录");
		assertBookmarkTargetFolder(folder);

		const now = Date.now();
		const bookmark: StoredTradeBookmark = {
			id: createId("bookmark"),
			title: getTradeBookmarkTitle(tab.title, tab.url),
			url: tab.url,
			parentId: folder.id,
			dateAdded: now,
			updatedAt: now,
		};

		folder.bookmarks.push(bookmark);
		folder.updatedAt = now;
		await saveBookmarkTree(tree);

		const item = toTradeBookmarkItem(bookmark);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
		return item;
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.AddFailed, error);
		throw error;
	}
}

export async function renameTradeBookmark(bookmarkId: string, title: string): Promise<TradeBookmarkItem> {
	try {
		const tree = await getBookmarkTree();
		const match = findBookmarkWithParent(tree, bookmarkId);
		if (!match) throw new Error("未找到 trade2 书签");

		match.bookmark.title = title.trim() || getTradeBookmarkTitle(undefined, match.bookmark.url);
		match.bookmark.updatedAt = Date.now();
		match.parent.updatedAt = match.bookmark.updatedAt;
		await saveBookmarkTree(tree);

		const item = toTradeBookmarkItem(match.bookmark);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
		return item;
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.RenameFailed, error);
		throw error;
	}
}

export async function deleteTradeBookmark(bookmarkId: string): Promise<void> {
	try {
		const tree = await getBookmarkTree();
		const folder = findBookmarkParentFolder(tree, bookmarkId);
		if (!folder) throw new Error("未找到 trade2 书签");

		folder.bookmarks = folder.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
		folder.updatedAt = Date.now();
		await saveBookmarkTree(tree);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.DeleteFailed, error);
		throw error;
	}
}

export async function moveTradeBookmark(
	bookmarkId: string,
	targetFolderId: string,
	targetIndex: number,
): Promise<void> {
	try {
		const tree = await getBookmarkTree();
		const currentFolder = findBookmarkParentFolder(tree, bookmarkId);
		const targetFolder = findFolder(tree, targetFolderId);
		const bookmark = currentFolder?.bookmarks.find((item) => item.id === bookmarkId);
		if (!currentFolder || !targetFolder || !bookmark) throw new Error("未找到 trade2 书签");
		assertBookmarkTargetFolder(targetFolder);

		const now = Date.now();
		const currentIndex = currentFolder.bookmarks.findIndex((item) => item.id === bookmarkId);
		if (currentIndex < 0) throw new Error("未找到 trade2 书签");

		currentFolder.bookmarks.splice(currentIndex, 1);
		const insertionIndex =
			currentFolder.id === targetFolder.id && currentIndex < targetIndex ? targetIndex - 1 : targetIndex;

		bookmark.parentId = targetFolder.id;
		bookmark.updatedAt = now;
		targetFolder.bookmarks.splice(clampInsertionIndex(insertionIndex, targetFolder.bookmarks.length), 0, bookmark);
		currentFolder.updatedAt = now;
		targetFolder.updatedAt = now;

		await saveBookmarkTree(tree);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.MoveFailed, error);
		throw error;
	}
}

export async function replaceTradeBookmarkWithCurrentSearch(bookmarkId: string): Promise<TradeBookmarkItem> {
	try {
		const [tree, tab] = await Promise.all([getBookmarkTree(), getActiveTab()]);

		if (!tab?.url || !isTrade2Url(tab.url)) {
			throw new Error("当前活动标签页不是 trade2 搜索页");
		}

		const match = findBookmarkWithParent(tree, bookmarkId);
		if (!match) throw new Error("未找到 trade2 书签");

		match.bookmark.url = tab.url;
		match.bookmark.updatedAt = Date.now();
		match.parent.updatedAt = match.bookmark.updatedAt;
		await saveBookmarkTree(tree);

		const item = toTradeBookmarkItem(match.bookmark);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
		return item;
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.ReplaceFailed, error);
		throw error;
	}
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

async function refreshTradeBookmarkServiceTree(
	type: TradeBookmarkServiceEventType.Loaded | TradeBookmarkServiceEventType.Changed,
): Promise<TradeBookmarkRoot> {
	const tree = await getTradeBookmarkRootTree();
	currentRootTree = tree;
	lastBookmarkServiceErrorCode = TradeBookmarkServiceErrorCode.None;
	publishTradeBookmarkEvent({ type, tree });
	return tree;
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

export function getTradeBookmarkServiceErrorMessage(code: TradeBookmarkServiceErrorCode): string {
	return tradeBookmarkServiceErrorMessages[code];
}

function toBookmarkFolderOption(folder: StoredTradeBookmarkFolder): BookmarkFolderOption {
	return {
		id: folder.id,
		title: folder.title,
		parentId: folder.parentId,
		canModify: canModifyFolder(folder),
	};
}

function collectTradeBookmarkGroups(folders: StoredTradeBookmarkFolder[]): TradeBookmarkGroup[] {
	const groups: TradeBookmarkGroup[] = [];

	for (const folder of folders) {
		const bookmarks = folder.bookmarks.filter((bookmark) => isTrade2Url(bookmark.url)).map(toTradeBookmarkItem);
		if (bookmarks.length === 0) continue;

		groups.push({
			id: folder.id,
			title: folder.title,
			bookmarks,
		});
	}

	return groups;
}

function collectTradeBookmarkRoot(tree: StoredTradeBookmarkTree): TradeBookmarkRoot {
	return {
		folders: tree.root.folders.map((folder) => collectTradeBookmarkFolder(tree, folder)),
	};
}

function collectTradeBookmarkFolder(
	tree: StoredTradeBookmarkTree,
	folder: StoredTradeBookmarkFolder,
): TradeBookmarkFolder {
	return {
		id: folder.id,
		title: folder.title,
		parentId: folder.parentId,
		canModify: canModifyFolder(folder),
		bookmarks: folder.bookmarks.filter((bookmark) => isTrade2Url(bookmark.url)).map(toTradeBookmarkItem),
	};
}

function toTradeBookmarkItem(bookmark: StoredTradeBookmark): TradeBookmarkItem {
	return {
		id: bookmark.id,
		title: bookmark.title || getTradeBookmarkTitle(undefined, bookmark.url),
		url: bookmark.url,
		parentId: bookmark.parentId,
		dateAdded: bookmark.dateAdded,
	};
}

function getTradeBookmarkTitle(title: string | undefined, url: string): string {
	const trimmedTitle = title?.trim();
	if (trimmedTitle) return trimmedTitle;

	try {
		const parsedUrl = new URL(url);
		const queryId = parsedUrl.pathname.split("/").filter(Boolean).pop();
		return queryId ? `Trade 搜索 ${queryId}` : "Trade 搜索";
	} catch {
		return "Trade 搜索";
	}
}

async function getActiveTab(): Promise<ActiveBrowserTab | undefined> {
	const [tab] = await browser.tabs.query({
		active: true,
		currentWindow: true,
	});

	return tab;
}

function findFolder(tree: StoredTradeBookmarkTree, folderId: string): StoredTradeBookmarkFolder | null {
	return tree.root.folders.find((folder) => folder.id === folderId) ?? null;
}

function findBookmarkWithParent(
	tree: StoredTradeBookmarkTree,
	bookmarkId: string,
): { bookmark: StoredTradeBookmark; parent: StoredTradeBookmarkFolder } | null {
	for (const folder of tree.root.folders) {
		const bookmark = folder.bookmarks.find((item) => item.id === bookmarkId);
		if (bookmark) return { bookmark, parent: folder };
	}

	return null;
}

function findBookmarkParentFolder(tree: StoredTradeBookmarkTree, bookmarkId: string): StoredTradeBookmarkFolder | null {
	return findBookmarkWithParent(tree, bookmarkId)?.parent ?? null;
}

function assertModifiableFolder(folder: StoredTradeBookmarkFolder): void {
	if (!canModifyFolder(folder)) throw new Error("该书签目录不能修改");
}

function assertBookmarkTargetFolder(folder: StoredTradeBookmarkFolder): void {
	if (!isFirstLevelFolder(folder)) throw new Error("书签只能保存在一级文件夹内");
}

function canModifyFolder(folder: StoredTradeBookmarkFolder): boolean {
	return isFirstLevelFolder(folder);
}

function isFirstLevelFolder(folder: StoredTradeBookmarkFolder): boolean {
	return folder.parentId === rootFolderId && folder.id !== rootFolderId;
}

function normalizeFolderTitle(title: string): string {
	const trimmedTitle = title.trim();
	return trimmedTitle || "New Folder";
}

function clampInsertionIndex(index: number, length: number): number {
	if (!Number.isFinite(index)) return length;
	return Math.max(0, Math.min(Math.trunc(index), length));
}

function createId(prefix: "folder" | "bookmark"): string {
	const randomId =
		globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	return `${prefix}-${randomId}`;
}
