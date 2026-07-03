import browser from "webextension-polyfill";
import { getBookmarkTree, rootFolderId, saveBookmarkTree } from "./bookmarks-storage";
import type {
	BookmarkFolderOption,
	StoredTradeBookmark,
	StoredTradeBookmarkFolder,
	TradeBookmarkGroup,
	TradeBookmarkItem,
	TradeBookmarkTreeNode,
} from "./bookmarks-types";

export type {
	BookmarkFolderOption,
	TradeBookmarkGroup,
	TradeBookmarkItem,
	TradeBookmarkTreeNode,
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
	| { type: TradeBookmarkServiceEventType.Loaded; tree: TradeBookmarkTreeNode }
	| { type: TradeBookmarkServiceEventType.Changed; tree: TradeBookmarkTreeNode }
	| { type: TradeBookmarkServiceEventType.Error; code: TradeBookmarkServiceErrorCode; error: unknown };

let currentRootTree: TradeBookmarkTreeNode | null = null;
let isBookmarkServiceLoading = false;
let lastBookmarkServiceErrorCode = TradeBookmarkServiceErrorCode.None;
const listeners = new Set<(event: TradeBookmarkServiceEvent) => void>();

export function getCurrentTradeBookmarkTree(): TradeBookmarkTreeNode | null {
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

export async function loadTradeBookmarks(): Promise<TradeBookmarkTreeNode> {
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

export async function getTradeBookmarkRootTree(): Promise<TradeBookmarkTreeNode> {
	const tree = await getBookmarkTree();
	return collectTradeBookmarkTree(tree.root, [tree.root.title]);
}

export async function createBookmarkFolder(parentId: string, title: string): Promise<BookmarkFolderOption> {
	try {
		if (parentId !== rootFolderId) throw new Error("只能在顶层创建一级文件夹");

		const tree = await getBookmarkTree();
		const parent = findFolder(tree.root, parentId);
		if (!parent) throw new Error("未找到父级书签目录");

		const now = Date.now();
		const folder: StoredTradeBookmarkFolder = {
			id: createId("folder"),
			title: normalizeFolderTitle(title),
			parentId,
			children: [],
			bookmarks: [],
			createdAt: now,
			updatedAt: now,
		};

		parent.children.push(folder);
		parent.updatedAt = now;
		await saveBookmarkTree(tree);

		const option = await getBookmarkFolderOption(folder.id);
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
		const folder = findFolder(tree.root, folderId);
		if (!folder) throw new Error("未找到书签目录");
		assertModifiableFolder(folder);

		folder.title = normalizeFolderTitle(title);
		folder.updatedAt = Date.now();
		await saveBookmarkTree(tree);

		const option = await getBookmarkFolderOption(folderId);
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
		const parent = findParentFolder(tree.root, folderId);
		const folder = parent?.children.find((child) => child.id === folderId);
		if (!parent || !folder) throw new Error("未找到书签目录");
		assertModifiableFolder(folder);

		parent.children = parent.children.filter((child) => child.id !== folderId);
		parent.updatedAt = Date.now();
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
		const currentParent = findParentFolder(tree.root, folderId);
		const targetParent = findFolder(tree.root, targetParentId);
		const folder = currentParent?.children.find((child) => child.id === folderId);
		if (!currentParent || !targetParent || !folder) throw new Error("未找到书签目录");
		assertModifiableFolder(folder);
		if (folder.id === targetParent.id || findFolder(folder, targetParent.id)) {
			throw new Error("不能将文件夹移动到自身或子文件夹内");
		}

		const now = Date.now();
		const currentIndex = currentParent.children.findIndex((child) => child.id === folderId);
		if (currentIndex < 0) throw new Error("未找到书签目录");

		currentParent.children.splice(currentIndex, 1);
		const insertionIndex =
			currentParent.id === targetParent.id && currentIndex < targetIndex ? targetIndex - 1 : targetIndex;

		folder.parentId = targetParent.id;
		folder.updatedAt = now;
		targetParent.children.splice(clampInsertionIndex(insertionIndex, targetParent.children.length), 0, folder);
		currentParent.updatedAt = now;
		targetParent.updatedAt = now;

		await saveBookmarkTree(tree);
		await refreshTradeBookmarkServiceTree(TradeBookmarkServiceEventType.Changed);
	} catch (error) {
		publishTradeBookmarkError(TradeBookmarkServiceErrorCode.MoveFailed, error);
		throw error;
	}
}

export async function getTradeBookmarkGroups(folderId: string): Promise<TradeBookmarkGroup[]> {
	const tree = await getBookmarkTree();
	const folder = findFolder(tree.root, folderId);
	if (!folder) return [];

	return collectTradeBookmarkGroups(folder, getFolderPath(tree.root, folderId) ?? [folder.title]);
}

export async function getTradeBookmarkTree(folderId: string): Promise<TradeBookmarkTreeNode | null> {
	const tree = await getBookmarkTree();
	const folder = findFolder(tree.root, folderId);
	if (!folder) return null;

	return collectTradeBookmarkTree(folder, getFolderPath(tree.root, folderId) ?? [folder.title]);
}

export async function addCurrentTradeSearchBookmark(folderId: string): Promise<TradeBookmarkItem> {
	try {
		const tab = await getActiveTab();
		if (!tab?.url || !isTrade2Url(tab.url)) {
			throw new Error("当前活动标签页不是 trade2 搜索页");
		}

		const tree = await getBookmarkTree();
		const folder = findFolder(tree.root, folderId);
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
		const bookmark = findBookmark(tree.root, bookmarkId);
		if (!bookmark) throw new Error("未找到 trade2 书签");

		bookmark.title = title.trim() || getTradeBookmarkTitle(undefined, bookmark.url);
		bookmark.updatedAt = Date.now();
		await saveBookmarkTree(tree);

		const item = toTradeBookmarkItem(bookmark);
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
		const folder = findBookmarkParentFolder(tree.root, bookmarkId);
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
		const currentFolder = findBookmarkParentFolder(tree.root, bookmarkId);
		const targetFolder = findFolder(tree.root, targetFolderId);
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

		const bookmark = findBookmark(tree.root, bookmarkId);
		if (!bookmark) throw new Error("未找到 trade2 书签");

		bookmark.url = tab.url;
		bookmark.updatedAt = Date.now();
		await saveBookmarkTree(tree);

		const item = toTradeBookmarkItem(bookmark);
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
): Promise<TradeBookmarkTreeNode> {
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

function toBookmarkFolderOption(folder: StoredTradeBookmarkFolder, path: string[]): BookmarkFolderOption {
	return {
		id: folder.id,
		title: folder.title,
		path,
		depth: Math.max(0, path.length - 1),
		parentId: folder.parentId,
		canModify: canModifyFolder(folder),
	};
}

function collectTradeBookmarkGroups(folder: StoredTradeBookmarkFolder, path: string[]): TradeBookmarkGroup[] {
	const groups: TradeBookmarkGroup[] = [];
	const bookmarks = folder.bookmarks.filter((bookmark) => isTrade2Url(bookmark.url)).map(toTradeBookmarkItem);

	if (bookmarks.length > 0) {
		groups.push({
			id: folder.id,
			title: folder.title,
			path,
			bookmarks,
		});
	}

	for (const child of folder.children) {
		groups.push(...collectTradeBookmarkGroups(child, [...path, child.title]));
	}

	return groups;
}

function collectTradeBookmarkTree(folder: StoredTradeBookmarkFolder, path: string[]): TradeBookmarkTreeNode {
	return {
		id: folder.id,
		title: folder.title,
		path,
		parentId: folder.parentId,
		canModify: canModifyFolder(folder),
		bookmarks: folder.bookmarks.filter((bookmark) => isTrade2Url(bookmark.url)).map(toTradeBookmarkItem),
		children: folder.children.map((child) => collectTradeBookmarkTree(child, [...path, child.title])),
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

async function getBookmarkFolderOption(folderId: string): Promise<BookmarkFolderOption> {
	const tree = await getBookmarkTree();
	const folder = findFolder(tree.root, folderId);
	if (!folder) throw new Error("未找到书签目录");

	return toBookmarkFolderOption(folder, getFolderPath(tree.root, folderId) ?? [folder.title]);
}

function findFolder(folder: StoredTradeBookmarkFolder, folderId: string): StoredTradeBookmarkFolder | null {
	if (folder.id === folderId) return folder;

	for (const child of folder.children) {
		const match = findFolder(child, folderId);
		if (match) return match;
	}

	return null;
}

function findParentFolder(folder: StoredTradeBookmarkFolder, folderId: string): StoredTradeBookmarkFolder | null {
	if (folder.children.some((child) => child.id === folderId)) return folder;

	for (const child of folder.children) {
		const match = findParentFolder(child, folderId);
		if (match) return match;
	}

	return null;
}

function findBookmark(folder: StoredTradeBookmarkFolder, bookmarkId: string): StoredTradeBookmark | null {
	for (const bookmark of folder.bookmarks) {
		if (bookmark.id === bookmarkId) return bookmark;
	}

	for (const child of folder.children) {
		const match = findBookmark(child, bookmarkId);
		if (match) return match;
	}

	return null;
}

function findBookmarkParentFolder(
	folder: StoredTradeBookmarkFolder,
	bookmarkId: string,
): StoredTradeBookmarkFolder | null {
	if (folder.bookmarks.some((bookmark) => bookmark.id === bookmarkId)) return folder;

	for (const child of folder.children) {
		const match = findBookmarkParentFolder(child, bookmarkId);
		if (match) return match;
	}

	return null;
}

function getFolderPath(
	folder: StoredTradeBookmarkFolder,
	folderId: string,
	parentPath: string[] = [],
): string[] | null {
	const path = [...parentPath, folder.title];
	if (folder.id === folderId) return path;

	for (const child of folder.children) {
		const match = getFolderPath(child, folderId, path);
		if (match) return match;
	}

	return null;
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
