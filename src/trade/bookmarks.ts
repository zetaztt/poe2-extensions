export interface BookmarkFolderOption {
	id: string;
	title: string;
	path: string[];
	depth: number;
	parentId?: string;
	canModify: boolean;
}

export interface TradeBookmarkItem {
	id: string;
	title: string;
	url: string;
	parentId?: string;
	dateAdded?: number;
}

export interface TradeBookmarkGroup {
	id: string;
	title: string;
	path: string[];
	bookmarks: TradeBookmarkItem[];
}

export interface TradeBookmarkTreeNode extends TradeBookmarkGroup {
	parentId?: string;
	canModify: boolean;
	children: TradeBookmarkTreeNode[];
}

interface StoredTradeBookmark {
	id: string;
	title: string;
	url: string;
	parentId: string;
	dateAdded: number;
	updatedAt: number;
}

interface StoredTradeBookmarkFolder {
	id: string;
	title: string;
	parentId?: string;
	children: StoredTradeBookmarkFolder[];
	bookmarks: StoredTradeBookmark[];
	createdAt: number;
	updatedAt: number;
}

interface StoredTradeBookmarkTree {
	version: 1;
	root: StoredTradeBookmarkFolder;
}

type ActiveBrowserTab = {
	id?: number;
	title?: string;
	url?: string;
};

const tradeBookmarkTreeStorageKey = 'tradeBookmarkTree';
const rootFolderId = 'trade-bookmarks-root';
const rootFolderTitle = 'Trade 书签';
const storage = browser.storage.local;

export async function getTradeBookmarkRootGroups(): Promise<TradeBookmarkGroup[]> {
	return getTradeBookmarkGroups(rootFolderId);
}

export async function getTradeBookmarkRootTree(): Promise<TradeBookmarkTreeNode> {
	const tree = await getBookmarkTree();
	return collectTradeBookmarkTree(tree.root, [tree.root.title]);
}

export async function createBookmarkFolder(parentId: string, title: string): Promise<BookmarkFolderOption> {
	const tree = await getBookmarkTree();
	const parent = findFolder(tree.root, parentId);
	if (!parent) throw new Error('未找到父级书签目录');

	const now = Date.now();
	const folder: StoredTradeBookmarkFolder = {
		id: createId('folder'),
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

	return getBookmarkFolderOption(folder.id);
}

export async function renameBookmarkFolder(folderId: string, title: string): Promise<BookmarkFolderOption> {
	const tree = await getBookmarkTree();
	const folder = findFolder(tree.root, folderId);
	if (!folder) throw new Error('未找到书签目录');
	assertModifiableFolder(folder);

	folder.title = normalizeFolderTitle(title);
	folder.updatedAt = Date.now();
	await saveBookmarkTree(tree);

	return getBookmarkFolderOption(folderId);
}

export async function deleteBookmarkFolder(folderId: string): Promise<void> {
	const tree = await getBookmarkTree();
	const parent = findParentFolder(tree.root, folderId);
	const folder = parent?.children.find((child) => child.id === folderId);
	if (!parent || !folder) throw new Error('未找到书签目录');
	assertModifiableFolder(folder);

	parent.children = parent.children.filter((child) => child.id !== folderId);
	parent.updatedAt = Date.now();
	await saveBookmarkTree(tree);
}

export async function moveBookmarkFolder(folderId: string, targetParentId: string, targetIndex: number): Promise<void> {
	const tree = await getBookmarkTree();
	const currentParent = findParentFolder(tree.root, folderId);
	const targetParent = findFolder(tree.root, targetParentId);
	const folder = currentParent?.children.find((child) => child.id === folderId);
	if (!currentParent || !targetParent || !folder) throw new Error('未找到书签目录');
	assertModifiableFolder(folder);
	if (folder.id === targetParent.id || findFolder(folder, targetParent.id)) {
		throw new Error('不能将文件夹移动到自身或子文件夹内');
	}

	const now = Date.now();
	const currentIndex = currentParent.children.findIndex((child) => child.id === folderId);
	if (currentIndex < 0) throw new Error('未找到书签目录');

	currentParent.children.splice(currentIndex, 1);
	const insertionIndex = currentParent.id === targetParent.id && currentIndex < targetIndex
		? targetIndex - 1
		: targetIndex;

	folder.parentId = targetParent.id;
	folder.updatedAt = now;
	targetParent.children.splice(clampInsertionIndex(insertionIndex, targetParent.children.length), 0, folder);
	currentParent.updatedAt = now;
	targetParent.updatedAt = now;

	await saveBookmarkTree(tree);
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
	const tab = await getActiveTab();
	if (!tab?.url || !isTrade2Url(tab.url)) {
		throw new Error('当前活动标签页不是 trade2 搜索页');
	}

	const tree = await getBookmarkTree();
	const folder = findFolder(tree.root, folderId);
	if (!folder) throw new Error('未找到书签目录');

	const now = Date.now();
	const bookmark: StoredTradeBookmark = {
		id: createId('bookmark'),
		title: getTradeBookmarkTitle(tab.title, tab.url),
		url: tab.url,
		parentId: folder.id,
		dateAdded: now,
		updatedAt: now,
	};

	folder.bookmarks.push(bookmark);
	folder.updatedAt = now;
	await saveBookmarkTree(tree);

	return toTradeBookmarkItem(bookmark);
}

export async function renameTradeBookmark(bookmarkId: string, title: string): Promise<TradeBookmarkItem> {
	const tree = await getBookmarkTree();
	const bookmark = findBookmark(tree.root, bookmarkId);
	if (!bookmark) throw new Error('未找到 trade2 书签');

	bookmark.title = title.trim() || getTradeBookmarkTitle(undefined, bookmark.url);
	bookmark.updatedAt = Date.now();
	await saveBookmarkTree(tree);

	return toTradeBookmarkItem(bookmark);
}

export async function deleteTradeBookmark(bookmarkId: string): Promise<void> {
	const tree = await getBookmarkTree();
	const folder = findBookmarkParentFolder(tree.root, bookmarkId);
	if (!folder) throw new Error('未找到 trade2 书签');

	folder.bookmarks = folder.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
	folder.updatedAt = Date.now();
	await saveBookmarkTree(tree);
}

export async function moveTradeBookmark(bookmarkId: string, targetFolderId: string, targetIndex: number): Promise<void> {
	const tree = await getBookmarkTree();
	const currentFolder = findBookmarkParentFolder(tree.root, bookmarkId);
	const targetFolder = findFolder(tree.root, targetFolderId);
	const bookmark = currentFolder?.bookmarks.find((item) => item.id === bookmarkId);
	if (!currentFolder || !targetFolder || !bookmark) throw new Error('未找到 trade2 书签');

	const now = Date.now();
	const currentIndex = currentFolder.bookmarks.findIndex((item) => item.id === bookmarkId);
	if (currentIndex < 0) throw new Error('未找到 trade2 书签');

	currentFolder.bookmarks.splice(currentIndex, 1);
	const insertionIndex = currentFolder.id === targetFolder.id && currentIndex < targetIndex
		? targetIndex - 1
		: targetIndex;

	bookmark.parentId = targetFolder.id;
	bookmark.updatedAt = now;
	targetFolder.bookmarks.splice(clampInsertionIndex(insertionIndex, targetFolder.bookmarks.length), 0, bookmark);
	currentFolder.updatedAt = now;
	targetFolder.updatedAt = now;

	await saveBookmarkTree(tree);
}

export async function replaceTradeBookmarkWithCurrentSearch(bookmarkId: string): Promise<TradeBookmarkItem> {
	const [tree, tab] = await Promise.all([
		getBookmarkTree(),
		getActiveTab(),
	]);

	if (!tab?.url || !isTrade2Url(tab.url)) {
		throw new Error('当前活动标签页不是 trade2 搜索页');
	}

	const bookmark = findBookmark(tree.root, bookmarkId);
	if (!bookmark) throw new Error('未找到 trade2 书签');

	bookmark.url = tab.url;
	bookmark.updatedAt = Date.now();
	await saveBookmarkTree(tree);

	return toTradeBookmarkItem(bookmark);
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
		return parsedUrl.origin === 'https://www.pathofexile.com' && parsedUrl.pathname.startsWith('/trade2');
	} catch {
		return false;
	}
}

async function getBookmarkTree(): Promise<StoredTradeBookmarkTree> {
	const values = await storage.get(tradeBookmarkTreeStorageKey);
	const value = values[tradeBookmarkTreeStorageKey];

	if (isStoredBookmarkTree(value)) return value;

	const tree = createDefaultBookmarkTree();
	await saveBookmarkTree(tree);
	return tree;
}

async function saveBookmarkTree(tree: StoredTradeBookmarkTree): Promise<void> {
	await storage.set({
		[tradeBookmarkTreeStorageKey]: tree,
	});
}

function createDefaultBookmarkTree(): StoredTradeBookmarkTree {
	const now = Date.now();
	return {
		version: 1,
		root: {
			id: rootFolderId,
			title: rootFolderTitle,
			children: [],
			bookmarks: [],
			createdAt: now,
			updatedAt: now,
		},
	};
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
	const bookmarks = folder.bookmarks
		.filter((bookmark) => isTrade2Url(bookmark.url))
		.map(toTradeBookmarkItem);

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
		bookmarks: folder.bookmarks
			.filter((bookmark) => isTrade2Url(bookmark.url))
			.map(toTradeBookmarkItem),
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
		const queryId = parsedUrl.pathname.split('/').filter(Boolean).pop();
		return queryId ? `Trade 搜索 ${queryId}` : 'Trade 搜索';
	} catch {
		return 'Trade 搜索';
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
	if (!folder) throw new Error('未找到书签目录');

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

function findBookmarkParentFolder(folder: StoredTradeBookmarkFolder, bookmarkId: string): StoredTradeBookmarkFolder | null {
	if (folder.bookmarks.some((bookmark) => bookmark.id === bookmarkId)) return folder;

	for (const child of folder.children) {
		const match = findBookmarkParentFolder(child, bookmarkId);
		if (match) return match;
	}

	return null;
}

function getFolderPath(folder: StoredTradeBookmarkFolder, folderId: string, parentPath: string[] = []): string[] | null {
	const path = [...parentPath, folder.title];
	if (folder.id === folderId) return path;

	for (const child of folder.children) {
		const match = getFolderPath(child, folderId, path);
		if (match) return match;
	}

	return null;
}

function assertModifiableFolder(folder: StoredTradeBookmarkFolder): void {
	if (!canModifyFolder(folder)) throw new Error('该书签目录不能修改');
}

function canModifyFolder(folder: StoredTradeBookmarkFolder): boolean {
	return Boolean(folder.parentId && folder.id !== rootFolderId);
}

function normalizeFolderTitle(title: string): string {
	const trimmedTitle = title.trim();
	return trimmedTitle || 'New Folder';
}

function clampInsertionIndex(index: number, length: number): number {
	if (!Number.isFinite(index)) return length;
	return Math.max(0, Math.min(Math.trunc(index), length));
}

function createId(prefix: 'folder' | 'bookmark'): string {
	const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	return `${prefix}-${randomId}`;
}

function isStoredBookmarkTree(value: unknown): value is StoredTradeBookmarkTree {
	if (!isRecord(value) || value.version !== 1) return false;
	return isStoredFolder(value.root, true);
}

function isStoredFolder(value: unknown, isRoot = false): value is StoredTradeBookmarkFolder {
	if (!isRecord(value)) return false;
	if (typeof value.id !== 'string' || typeof value.title !== 'string') return false;
	if (!isRoot && typeof value.parentId !== 'string') return false;
	if (isRoot && value.parentId !== undefined) return false;
	if (typeof value.createdAt !== 'number' || typeof value.updatedAt !== 'number') return false;
	if (!Array.isArray(value.children) || !Array.isArray(value.bookmarks)) return false;

	return value.children.every((child) => isStoredFolder(child)) && value.bookmarks.every(isStoredBookmark);
}

function isStoredBookmark(value: unknown): value is StoredTradeBookmark {
	if (!isRecord(value)) return false;

	return typeof value.id === 'string'
		&& typeof value.title === 'string'
		&& typeof value.url === 'string'
		&& typeof value.parentId === 'string'
		&& typeof value.dateAdded === 'number'
		&& typeof value.updatedAt === 'number';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
