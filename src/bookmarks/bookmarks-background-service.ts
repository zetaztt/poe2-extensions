import { ipcMain } from "../ipc/ipc";
import { bookmarksIpcProtocol } from "./bookmarks-ipc-protocol";
import {
	exportBookmarkFolder,
	exportBookmarkTree,
	getBookmarkTree,
	importBookmarkData,
	saveBookmarkTree,
} from "./bookmarks-storage";
import {
	rootFolderId,
	type BookmarkFolderOption,
	type StoredTradeBookmark,
	type StoredTradeBookmarkFolder,
	type StoredTradeBookmarkTree,
	type TradeBookmarkChangeResult,
	type TradeBookmarkFolder,
	type TradeBookmarkGroup,
	type TradeBookmarkItem,
	type TradeBookmarkRoot,
	type TradeBookmarkTreeSnapshot,
} from "./bookmarks-types";

const bookmarkServiceInstanceId = createId("instance");

// background 生命周期内的唯一持久化模型；所有窗口的命令都直接修改这棵树。
let storedBookmarkTree: StoredTradeBookmarkTree | null = null;
let storedBookmarkTreePromise: Promise<StoredTradeBookmarkTree> | null = null;
// revision 用来识别保存期间出现的新修改，并让各侧边栏丢弃重复或过期广播。
let bookmarkRevision = 0;
let persistedBookmarkRevision = 0;
let bookmarkSavePromise: Promise<void> | null = null;

export function installTradeBookmarkHandlers(): void {
	ipcMain.handle(bookmarksIpcProtocol.load, loadBookmarks);
	ipcMain.handle(bookmarksIpcProtocol.getRootGroups, getRootGroups);
	ipcMain.handle(bookmarksIpcProtocol.getRootTree, getRootTree);
	ipcMain.handle(bookmarksIpcProtocol.getGroups, ({ folderId }) => getGroups(folderId));
	ipcMain.handle(bookmarksIpcProtocol.getTree, ({ folderId }) => getTree(folderId));
	ipcMain.handle(bookmarksIpcProtocol.createFolder, ({ parentId, title }) => createFolder(parentId, title));
	ipcMain.handle(bookmarksIpcProtocol.renameFolder, ({ folderId, title }) => renameFolder(folderId, title));
	ipcMain.handle(bookmarksIpcProtocol.deleteFolder, ({ folderId }) => deleteFolder(folderId));
	ipcMain.handle(bookmarksIpcProtocol.moveFolder, ({ folderId, targetParentId, targetIndex }) =>
		moveFolder(folderId, targetParentId, targetIndex),
	);
	ipcMain.handle(bookmarksIpcProtocol.addCurrentSearch, ({ folderId, title, url }) =>
		addCurrentSearch(folderId, title, url),
	);
	ipcMain.handle(bookmarksIpcProtocol.renameBookmark, ({ bookmarkId, title }) => renameBookmark(bookmarkId, title));
	ipcMain.handle(bookmarksIpcProtocol.deleteBookmark, ({ bookmarkId }) => deleteBookmark(bookmarkId));
	ipcMain.handle(bookmarksIpcProtocol.moveBookmark, ({ bookmarkId, targetFolderId, targetIndex }) =>
		moveBookmark(bookmarkId, targetFolderId, targetIndex),
	);
	ipcMain.handle(bookmarksIpcProtocol.replaceBookmark, ({ bookmarkId, url }) => replaceBookmark(bookmarkId, url));
	ipcMain.handle(bookmarksIpcProtocol.exportTree, exportTree);
	ipcMain.handle(bookmarksIpcProtocol.exportFolder, ({ folderId }) => exportFolder(folderId));
	ipcMain.handle(bookmarksIpcProtocol.importData, ({ value }) => importData(value));
}

async function loadBookmarks(): Promise<TradeBookmarkTreeSnapshot> {
	return createTreeSnapshot(await getStoredBookmarkTree());
}

async function getRootGroups(): Promise<TradeBookmarkGroup[]> {
	return collectTradeBookmarkGroups((await getStoredBookmarkTree()).root.folders);
}

async function getRootTree(): Promise<TradeBookmarkRoot> {
	return collectTradeBookmarkRoot(await getStoredBookmarkTree());
}

async function getGroups(folderId: string): Promise<TradeBookmarkGroup[]> {
	const tree = await getStoredBookmarkTree();
	if (folderId === rootFolderId) return collectTradeBookmarkGroups(tree.root.folders);

	const folder = findFolder(tree, folderId);
	return folder ? collectTradeBookmarkGroups([folder]) : [];
}

async function getTree(folderId: string): Promise<TradeBookmarkRoot | TradeBookmarkFolder | null> {
	const tree = await getStoredBookmarkTree();
	if (folderId === rootFolderId) return collectTradeBookmarkRoot(tree);

	const folder = findFolder(tree, folderId);
	return folder ? collectTradeBookmarkFolder(folder) : null;
}

async function createFolder(parentId: string, title: string): Promise<TradeBookmarkChangeResult<BookmarkFolderOption>> {
	if (parentId !== rootFolderId) throw new Error("只能在顶层创建一级文件夹");

	const tree = await getStoredBookmarkTree();
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
	return commitBookmarkChange(tree, toBookmarkFolderOption(folder));
}

async function renameFolder(folderId: string, title: string): Promise<TradeBookmarkChangeResult<BookmarkFolderOption>> {
	const tree = await getStoredBookmarkTree();
	const folder = findFolder(tree, folderId);
	if (!folder) throw new Error("未找到书签目录");
	assertModifiableFolder(folder);

	folder.title = normalizeFolderTitle(title);
	folder.updatedAt = Date.now();
	return commitBookmarkChange(tree, toBookmarkFolderOption(folder));
}

async function deleteFolder(folderId: string): Promise<TradeBookmarkChangeResult<null>> {
	const tree = await getStoredBookmarkTree();
	const folder = findFolder(tree, folderId);
	if (!folder) throw new Error("未找到书签目录");
	assertModifiableFolder(folder);

	tree.root.folders = tree.root.folders.filter((item) => item.id !== folderId);
	tree.root.updatedAt = Date.now();
	return commitBookmarkChange(tree, null);
}

async function moveFolder(
	folderId: string,
	targetParentId: string,
	targetIndex: number,
): Promise<TradeBookmarkChangeResult<null>> {
	if (targetParentId !== rootFolderId) throw new Error("文件夹只能保存在顶层");

	const tree = await getStoredBookmarkTree();
	const currentIndex = tree.root.folders.findIndex((folder) => folder.id === folderId);
	if (currentIndex < 0) throw new Error("未找到书签目录");

	const [folder] = tree.root.folders.splice(currentIndex, 1);
	assertModifiableFolder(folder);
	const insertionIndex = currentIndex < targetIndex ? targetIndex - 1 : targetIndex;
	folder.parentId = rootFolderId;
	folder.updatedAt = Date.now();
	tree.root.folders.splice(clampInsertionIndex(insertionIndex, tree.root.folders.length), 0, folder);
	tree.root.updatedAt = folder.updatedAt;
	return commitBookmarkChange(tree, null);
}

async function addCurrentSearch(
	folderId: string,
	title: string | undefined,
	url: string,
): Promise<TradeBookmarkChangeResult<TradeBookmarkItem>> {
	if (!isTrade2Url(url)) throw new Error("当前活动标签页不是 trade2 搜索页");
	const tree = await getStoredBookmarkTree();
	const folder = findFolder(tree, folderId);
	if (!folder) throw new Error("未找到书签目录");
	assertBookmarkTargetFolder(folder);

	const now = Date.now();
	const bookmark: StoredTradeBookmark = {
		id: createId("bookmark"),
		title: getTradeBookmarkTitle(title, url),
		url,
		parentId: folder.id,
		dateAdded: now,
		updatedAt: now,
	};

	folder.bookmarks.push(bookmark);
	folder.updatedAt = now;
	return commitBookmarkChange(tree, toTradeBookmarkItem(bookmark));
}

async function renameBookmark(
	bookmarkId: string,
	title: string,
): Promise<TradeBookmarkChangeResult<TradeBookmarkItem>> {
	const tree = await getStoredBookmarkTree();
	const match = findBookmarkWithParent(tree, bookmarkId);
	if (!match) throw new Error("未找到 trade2 书签");

	match.bookmark.title = title.trim() || getTradeBookmarkTitle(undefined, match.bookmark.url);
	match.bookmark.updatedAt = Date.now();
	match.parent.updatedAt = match.bookmark.updatedAt;
	return commitBookmarkChange(tree, toTradeBookmarkItem(match.bookmark));
}

async function deleteBookmark(bookmarkId: string): Promise<TradeBookmarkChangeResult<null>> {
	const tree = await getStoredBookmarkTree();
	const folder = findBookmarkParentFolder(tree, bookmarkId);
	if (!folder) throw new Error("未找到 trade2 书签");

	folder.bookmarks = folder.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
	folder.updatedAt = Date.now();
	return commitBookmarkChange(tree, null);
}

async function moveBookmark(
	bookmarkId: string,
	targetFolderId: string,
	targetIndex: number,
): Promise<TradeBookmarkChangeResult<null>> {
	const tree = await getStoredBookmarkTree();
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
	return commitBookmarkChange(tree, null);
}

async function replaceBookmark(bookmarkId: string, url: string): Promise<TradeBookmarkChangeResult<TradeBookmarkItem>> {
	if (!isTrade2Url(url)) throw new Error("当前活动标签页不是 trade2 搜索页");
	const tree = await getStoredBookmarkTree();
	const match = findBookmarkWithParent(tree, bookmarkId);
	if (!match) throw new Error("未找到 trade2 书签");

	match.bookmark.url = url;
	match.bookmark.updatedAt = Date.now();
	match.parent.updatedAt = match.bookmark.updatedAt;
	return commitBookmarkChange(tree, toTradeBookmarkItem(match.bookmark));
}

async function exportTree() {
	return exportBookmarkTree(await getStoredBookmarkTree());
}

async function exportFolder(folderId: string) {
	return exportBookmarkFolder(await getStoredBookmarkTree(), folderId);
}

async function importData(value: unknown): Promise<TradeBookmarkChangeResult<null>> {
	const tree = await getStoredBookmarkTree();
	if (!importBookmarkData(tree, value)) return createBookmarkChangeResult(tree, null);
	return commitBookmarkChange(tree, null);
}

async function getStoredBookmarkTree(): Promise<StoredTradeBookmarkTree> {
	if (storedBookmarkTree) return storedBookmarkTree;

	storedBookmarkTreePromise ??= getBookmarkTree()
		.then((tree) => {
			storedBookmarkTree = tree;
			return tree;
		})
		.catch((error) => {
			storedBookmarkTreePromise = null;
			throw error;
		});
	return storedBookmarkTreePromise;
}

function commitBookmarkChange<T>(tree: StoredTradeBookmarkTree, value: T): TradeBookmarkChangeResult<T> {
	bookmarkRevision += 1;
	const result = createBookmarkChangeResult(tree, value);
	void ipcMain.send(bookmarksIpcProtocol.changed, result);
	scheduleBookmarkSave(tree);
	return result;
}

function createBookmarkChangeResult<T>(tree: StoredTradeBookmarkTree, value: T): TradeBookmarkChangeResult<T> {
	return {
		...createTreeSnapshot(tree),
		value,
	};
}

function createTreeSnapshot(tree: StoredTradeBookmarkTree): TradeBookmarkTreeSnapshot {
	return {
		instanceId: bookmarkServiceInstanceId,
		revision: bookmarkRevision,
		tree: collectTradeBookmarkRoot(tree),
	};
}

function scheduleBookmarkSave(tree: StoredTradeBookmarkTree): void {
	if (bookmarkSavePromise) return;

	// 每轮保存独立快照；共享对象可以继续接收命令，不会被 storage 的异步序列化过程影响。
	const attemptedRevision = bookmarkRevision;
	const snapshot = structuredClone(tree);
	let saveSucceeded = false;
	let saveError: unknown;
	bookmarkSavePromise = saveBookmarkTree(snapshot)
		.then(() => {
			persistedBookmarkRevision = attemptedRevision;
			saveSucceeded = true;
		})
		.catch((error: unknown) => {
			saveError = error;
			console.error("[poe2-extensions] trade 书签异步保存失败", error);
		})
		.finally(() => {
			bookmarkSavePromise = null;
			const changedDuringSave = bookmarkRevision > attemptedRevision;
			const hasNewerUnpersistedRevision = bookmarkRevision > persistedBookmarkRevision;
			if ((saveSucceeded || changedDuringSave) && hasNewerUnpersistedRevision) {
				scheduleBookmarkSave(tree);
				return;
			}

			// 有更新版本时先尝试保存最新快照；只有静止状态仍失败才向用户报告未持久化。
			if (!saveSucceeded) {
				void ipcMain.send(bookmarksIpcProtocol.persistenceFailed, {
					instanceId: bookmarkServiceInstanceId,
					revision: attemptedRevision,
					message: saveError instanceof Error ? saveError.message : "书签尚未保存到本地存储。",
				});
			}
		});
}

function collectTradeBookmarkRoot(tree: StoredTradeBookmarkTree): TradeBookmarkRoot {
	return {
		folders: tree.root.folders.map(collectTradeBookmarkFolder),
	};
}

function collectTradeBookmarkFolder(folder: StoredTradeBookmarkFolder): TradeBookmarkFolder {
	return {
		id: folder.id,
		title: folder.title,
		parentId: folder.parentId,
		canModify: canModifyFolder(folder),
		bookmarks: folder.bookmarks.filter((bookmark) => isTrade2Url(bookmark.url)).map(toTradeBookmarkItem),
	};
}

function collectTradeBookmarkGroups(folders: StoredTradeBookmarkFolder[]): TradeBookmarkGroup[] {
	const groups: TradeBookmarkGroup[] = [];
	for (const folder of folders) {
		const bookmarks = folder.bookmarks.filter((bookmark) => isTrade2Url(bookmark.url)).map(toTradeBookmarkItem);
		if (bookmarks.length === 0) continue;
		groups.push({ id: folder.id, title: folder.title, bookmarks });
	}
	return groups;
}

function toBookmarkFolderOption(folder: StoredTradeBookmarkFolder): BookmarkFolderOption {
	return {
		id: folder.id,
		title: folder.title,
		parentId: folder.parentId,
		canModify: canModifyFolder(folder),
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
	return title.trim() || "New Folder";
}

function getTradeBookmarkTitle(title: string | undefined, url: string): string {
	const trimmedTitle = title?.trim();
	if (trimmedTitle) return trimmedTitle;

	try {
		const queryId = new URL(url).pathname.split("/").filter(Boolean).pop();
		return queryId ? `Trade 搜索 ${queryId}` : "Trade 搜索";
	} catch {
		return "Trade 搜索";
	}
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

function clampInsertionIndex(index: number, length: number): number {
	if (!Number.isFinite(index)) return length;
	return Math.max(0, Math.min(Math.trunc(index), length));
}

function createId(prefix: "instance" | "folder" | "bookmark"): string {
	const randomId =
		globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	return `${prefix}-${randomId}`;
}
