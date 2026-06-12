import {
	clearTradeBookmarkFolderId,
	getTradeBookmarkFolderId,
	getTradeBookmarkFolderPath,
	setTradeBookmarkFolderId,
	setTradeBookmarkFolderPath,
} from '../settings';

export interface BookmarkFolderOption {
	id: string;
	title: string;
	path: string[];
	depth: number;
	parentId?: string;
	canModify: boolean;
}

export interface BookmarkFolderTreeNode extends BookmarkFolderOption {
	children: BookmarkFolderTreeNode[];
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

export type TradeBookmarkFolderStatus = 'selected' | 'none' | 'missing' | 'ambiguous';

export interface TradeBookmarkFolderSelection {
	status: TradeBookmarkFolderStatus;
	folder?: BookmarkFolderOption;
	path?: string[];
}

type BookmarkNode = {
	id: string;
	title: string;
	url?: string;
	parentId?: string;
	children?: BookmarkNode[];
	dateAdded?: number;
	unmodifiable?: string;
};

type ActiveBrowserTab = {
	id?: number;
	title?: string;
	url?: string;
};

export async function getBookmarkFolderOptions(): Promise<BookmarkFolderOption[]> {
	const tree = await getBookmarkTree();
	return collectBookmarkFolders(tree);
}

export async function getBookmarkFolderTree(): Promise<BookmarkFolderTreeNode[]> {
	const tree = await getBookmarkTree();
	return collectBookmarkFolderTree(tree);
}

export async function getSelectedTradeBookmarkFolder(): Promise<TradeBookmarkFolderSelection> {
	const [localFolderId, syncedPath, folders] = await Promise.all([
		getTradeBookmarkFolderId(),
		getTradeBookmarkFolderPath(),
		getBookmarkFolderOptions(),
	]);

	if (localFolderId) {
		const folder = folders.find((item) => item.id === localFolderId);
		if (folder) return { status: 'selected', folder };

		await clearTradeBookmarkFolderId();
	}

	if (!syncedPath) return { status: 'none' };

	const matches = folders.filter((folder) => isSamePath(folder.path, syncedPath));
	if (matches.length === 1) {
		await setTradeBookmarkFolderId(matches[0].id);
		return { status: 'selected', folder: matches[0], path: syncedPath };
	}

	return {
		status: matches.length > 1 ? 'ambiguous' : 'missing',
		path: syncedPath,
	};
}

export async function setSelectedTradeBookmarkFolder(folderId: string): Promise<BookmarkFolderOption> {
	const folders = await getBookmarkFolderOptions();
	const folder = folders.find((item) => item.id === folderId);
	if (!folder) throw new Error('未找到选择的书签目录');

	await Promise.all([
		setTradeBookmarkFolderId(folder.id),
		setTradeBookmarkFolderPath(folder.path),
	]);

	return folder;
}

export async function createBookmarkFolder(parentId: string, title: string): Promise<BookmarkFolderOption> {
	const node = await browser.bookmarks.create({
		parentId,
		title: normalizeFolderTitle(title),
	}) as BookmarkNode;

	return getBookmarkFolderOption(node.id);
}

export async function renameBookmarkFolder(folderId: string, title: string): Promise<BookmarkFolderOption> {
	await assertModifiableFolder(folderId);
	await browser.bookmarks.update(folderId, {
		title: normalizeFolderTitle(title),
	});

	return getBookmarkFolderOption(folderId);
}

export async function deleteBookmarkFolder(folderId: string): Promise<void> {
	await assertModifiableFolder(folderId);
	await browser.bookmarks.removeTree(folderId);
}

export async function getTradeBookmarkGroups(folderId: string): Promise<TradeBookmarkGroup[]> {
	const roots = await browser.bookmarks.getSubTree(folderId) as BookmarkNode[];
	const root = roots[0];
	if (!root) return [];

	return collectTradeBookmarkGroups(root, getFolderPath(root));
}

export async function getTradeBookmarkTree(folderId: string): Promise<TradeBookmarkTreeNode | null> {
	const roots = await browser.bookmarks.getSubTree(folderId) as BookmarkNode[];
	const root = roots[0];
	if (!root) return null;

	return collectTradeBookmarkTree(root, getFolderPath(root));
}

export async function addCurrentTradeSearchBookmark(folderId: string): Promise<TradeBookmarkItem> {
	const tab = await getActiveTab();
	if (!tab?.url || !isTrade2Url(tab.url)) {
		throw new Error('当前活动标签页不是 trade2 搜索页');
	}

	const node = await browser.bookmarks.create({
		parentId: folderId,
		title: getTradeBookmarkTitle(tab.title, tab.url),
		url: tab.url,
	}) as BookmarkNode;

	if (!node.url) throw new Error('书签创建失败');
	return toTradeBookmarkItem({ ...node, url: node.url });
}

export async function renameTradeBookmark(bookmarkId: string, title: string): Promise<TradeBookmarkItem> {
	const bookmark = await getTradeBookmarkNode(bookmarkId);
	const nextTitle = title.trim() || getTradeBookmarkTitle(undefined, bookmark.url);

	const node = await browser.bookmarks.update(bookmarkId, {
		title: nextTitle,
	}) as BookmarkNode;

	return toTradeBookmarkItem({ ...bookmark, ...node, url: bookmark.url });
}

export async function deleteTradeBookmark(bookmarkId: string): Promise<void> {
	await getTradeBookmarkNode(bookmarkId);
	await browser.bookmarks.remove(bookmarkId);
}

export async function replaceTradeBookmarkWithCurrentSearch(bookmarkId: string): Promise<TradeBookmarkItem> {
	const [bookmark, tab] = await Promise.all([
		getTradeBookmarkNode(bookmarkId),
		getActiveTab(),
	]);

	if (!tab?.url || !isTrade2Url(tab.url)) {
		throw new Error('当前活动标签页不是 trade2 搜索页');
	}

	const node = await browser.bookmarks.update(bookmarkId, {
		url: tab.url,
	}) as BookmarkNode;

	return toTradeBookmarkItem({
		...bookmark,
		...node,
		title: bookmark.title,
		url: tab.url,
	});
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

function getBookmarkTree(): Promise<BookmarkNode[]> {
	return browser.bookmarks.getTree() as Promise<BookmarkNode[]>;
}

function collectBookmarkFolders(nodes: BookmarkNode[], parentPath: string[] = []): BookmarkFolderOption[] {
	const folders: BookmarkFolderOption[] = [];

	for (const node of nodes) {
		if (!node.children) continue;

		const path = node.title ? [...parentPath, node.title] : parentPath;
		if (node.parentId) {
			folders.push({
				id: node.id,
				title: node.title,
				path,
				depth: Math.max(0, path.length - 1),
				parentId: node.parentId,
				canModify: canModifyFolder(node),
			});
		}

		folders.push(...collectBookmarkFolders(node.children, path));
	}

	return folders;
}

function collectBookmarkFolderTree(nodes: BookmarkNode[], parentPath: string[] = []): BookmarkFolderTreeNode[] {
	const folders: BookmarkFolderTreeNode[] = [];

	for (const node of nodes) {
		if (!node.children) continue;

		const path = node.title ? [...parentPath, node.title] : parentPath;
		const children = collectBookmarkFolderTree(node.children, path);

		if (node.parentId) {
			folders.push({
				id: node.id,
				title: node.title,
				path,
				depth: Math.max(0, path.length - 1),
				parentId: node.parentId,
				canModify: canModifyFolder(node),
				children,
			});
			continue;
		}

		folders.push(...children);
	}

	return folders;
}

function collectTradeBookmarkGroups(node: BookmarkNode, path: string[]): TradeBookmarkGroup[] {
	const groups: TradeBookmarkGroup[] = [];
	const children = node.children ?? [];
	const bookmarks = children
		.filter((child): child is BookmarkNode & { url: string } => Boolean(child.url && isTrade2Url(child.url)))
		.map(toTradeBookmarkItem);

	if (bookmarks.length > 0) {
		groups.push({
			id: node.id,
			title: node.title,
			path,
			bookmarks,
		});
	}

	for (const child of children) {
		if (!child.children) continue;
		groups.push(...collectTradeBookmarkGroups(child, [...path, child.title]));
	}

	return groups;
}

function collectTradeBookmarkTree(node: BookmarkNode, path: string[]): TradeBookmarkTreeNode {
	const children = node.children ?? [];
	const bookmarks = children
		.filter((child): child is BookmarkNode & { url: string } => Boolean(child.url && isTrade2Url(child.url)))
		.map(toTradeBookmarkItem);

	const folderChildren = children
		.filter((child): child is BookmarkNode & { children: BookmarkNode[] } => Boolean(child.children))
		.map((child) => collectTradeBookmarkTree(child, [...path, child.title]));

	return {
		id: node.id,
		title: node.title,
		path,
		parentId: node.parentId,
		canModify: canModifyFolder(node),
		bookmarks,
		children: folderChildren,
	};
}

function getFolderPath(node: BookmarkNode): string[] {
	return node.title ? [node.title] : [];
}

function toTradeBookmarkItem(node: BookmarkNode & { url: string }): TradeBookmarkItem {
	return {
		id: node.id,
		title: node.title || getTradeBookmarkTitle(undefined, node.url),
		url: node.url,
		parentId: node.parentId,
		dateAdded: node.dateAdded,
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
	const folders = await getBookmarkFolderOptions();
	const folder = folders.find((item) => item.id === folderId);
	if (!folder) throw new Error('未找到书签目录');

	return folder;
}

async function getTradeBookmarkNode(bookmarkId: string): Promise<BookmarkNode & { url: string }> {
	const [node] = await browser.bookmarks.get(bookmarkId) as BookmarkNode[];
	if (!node?.url || !isTrade2Url(node.url)) throw new Error('未找到 trade2 书签');
	return { ...node, url: node.url };
}

async function assertModifiableFolder(folderId: string): Promise<void> {
	const folder = await getBookmarkFolderOption(folderId);
	if (!folder.canModify) throw new Error('该书签目录不能修改');
}

function canModifyFolder(node: BookmarkNode): boolean {
	return Boolean(node.parentId && node.children && node.parentId !== '0' && !node.unmodifiable);
}

function normalizeFolderTitle(title: string): string {
	const trimmedTitle = title.trim();
	return trimmedTitle || 'New Folder';
}

function isSamePath(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}
