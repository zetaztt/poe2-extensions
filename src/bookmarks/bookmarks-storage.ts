import browser from "webextension-polyfill";
import {
	TradeBookmarkExportContent,
	type StoredTradeBookmark,
	type StoredTradeBookmarkFolder,
	type StoredTradeBookmarkTree,
	type TradeBookmarkExportData,
} from "./bookmarks-types";

export const rootFolderId = "trade-bookmarks-root";

const tradeBookmarkTreeStorageKey = "tradeBookmarkTree";
const tradeBookmarkExportSource = "poe2-extensions-trade-bookmarks";
const storage = browser.storage.local;

type BookmarkImportData =
	| { content: TradeBookmarkExportContent.Tree; tree: StoredTradeBookmarkTree }
	| { content: TradeBookmarkExportContent.Folder; folder: StoredTradeBookmarkFolder };

export async function getBookmarkTree(): Promise<StoredTradeBookmarkTree> {
	const values = await storage.get(tradeBookmarkTreeStorageKey);
	const value = values[tradeBookmarkTreeStorageKey];

	if (isStoredBookmarkTree(value)) return value;

	const tree = createDefaultBookmarkTree();
	await saveBookmarkTree(tree);
	return tree;
}

export async function saveBookmarkTree(tree: StoredTradeBookmarkTree): Promise<void> {
	await storage.set({
		[tradeBookmarkTreeStorageKey]: tree,
	});
}

export async function exportBookmarkTree(): Promise<TradeBookmarkExportData> {
	return {
		source: tradeBookmarkExportSource,
		exportedAt: Date.now(),
		content: TradeBookmarkExportContent.Tree,
		tree: structuredClone(await getBookmarkTree()),
	};
}

export async function exportBookmarkFolder(folderId: string): Promise<TradeBookmarkExportData> {
	const tree = await getBookmarkTree();
	const folder = findFolder(tree, folderId);
	if (!folder) throw new Error("未找到可导出的书签文件夹。");

	return {
		source: tradeBookmarkExportSource,
		exportedAt: Date.now(),
		content: TradeBookmarkExportContent.Folder,
		folder: structuredClone(folder),
	};
}

export async function importBookmarkData(value: unknown): Promise<void> {
	const data = getImportBookmarkData(value);
	if (!data) throw new Error("导入文件不是有效的 trade2 书签备份。");

	const tree = await getBookmarkTree();
	syncImportFolders(tree, getImportFolders(data));
	await saveBookmarkTree(tree);
}

function createDefaultBookmarkTree(): StoredTradeBookmarkTree {
	const now = Date.now();
	return {
		version: 1,
		root: {
			folders: [],
			createdAt: now,
			updatedAt: now,
		},
	};
}

function getImportFolders(data: BookmarkImportData): StoredTradeBookmarkFolder[] {
	return data.content === TradeBookmarkExportContent.Tree ? data.tree.root.folders : [data.folder];
}

function syncImportFolders(tree: StoredTradeBookmarkTree, importedFolders: StoredTradeBookmarkFolder[]): void {
	const now = Date.now();
	let hasChanged = false;

	for (const importedFolder of importedFolders) {
		const existingFolder = tree.root.folders.find((folder) => folder.id === importedFolder.id);
		const targetFolder = existingFolder ?? createImportFolder(tree, importedFolder);
		if (!existingFolder) hasChanged = true;

		for (const importedBookmark of importedFolder.bookmarks) {
			const existingBookmark = findBookmarkWithParent(tree, importedBookmark.id);
			if (existingBookmark) {
				if (
					existingBookmark.bookmark.url !== importedBookmark.url
					|| existingBookmark.bookmark.updatedAt !== importedBookmark.updatedAt
				) {
					existingBookmark.bookmark.url = importedBookmark.url;
					existingBookmark.bookmark.updatedAt = importedBookmark.updatedAt;
					existingBookmark.parent.updatedAt = now;
					hasChanged = true;
				}
				continue;
			}

			targetFolder.bookmarks.push({
				...structuredClone(importedBookmark),
				parentId: targetFolder.id,
			});
			targetFolder.updatedAt = now;
			hasChanged = true;
		}
	}

	if (hasChanged) tree.root.updatedAt = now;
}

function createImportFolder(
	tree: StoredTradeBookmarkTree,
	importedFolder: StoredTradeBookmarkFolder,
): StoredTradeBookmarkFolder {
	const folder: StoredTradeBookmarkFolder = {
		...structuredClone(importedFolder),
		parentId: rootFolderId,
		bookmarks: [],
	};
	tree.root.folders.push(folder);
	return folder;
}

function getImportBookmarkData(value: unknown): BookmarkImportData | null {
	if (!isRecord(value)) return null;

	if (value.source === tradeBookmarkExportSource && typeof value.exportedAt === "number") {
		if (value.content === TradeBookmarkExportContent.Folder && isStoredFolder(value.folder, true)) {
			return { content: TradeBookmarkExportContent.Folder, folder: value.folder };
		}

		if (
			(value.content === TradeBookmarkExportContent.Tree || value.content === undefined)
			&& isStoredBookmarkTree(value.tree, true)
		) {
			return { content: TradeBookmarkExportContent.Tree, tree: value.tree };
		}

		return null;
	}

	if (isStoredBookmarkTree(value, true)) return { content: TradeBookmarkExportContent.Tree, tree: value };
	return null;
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

function isStoredBookmarkTree(value: unknown, requireTrade2Urls = false): value is StoredTradeBookmarkTree {
	if (!isRecord(value) || value.version !== 1) return false;
	if (!isRecord(value.root)) return false;
	if (typeof value.root.createdAt !== "number" || typeof value.root.updatedAt !== "number") return false;
	if (!Array.isArray(value.root.folders)) return false;
	return value.root.folders.every((folder) => isStoredFolder(folder, requireTrade2Urls));
}

function isStoredFolder(value: unknown, requireTrade2Urls: boolean): value is StoredTradeBookmarkFolder {
	if (!isRecord(value)) return false;
	if (typeof value.id !== "string" || typeof value.title !== "string") return false;
	if (value.parentId !== rootFolderId) return false;
	if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return false;
	if (!Array.isArray(value.bookmarks)) return false;
	const folderId = value.id;

	return value.bookmarks.every((bookmark) => isStoredBookmark(bookmark, folderId, requireTrade2Urls));
}

function isStoredBookmark(
	value: unknown,
	parentFolderId: string,
	requireTrade2Urls: boolean,
): value is StoredTradeBookmark {
	if (!isRecord(value)) return false;

	return (
		typeof value.id === "string"
		&& typeof value.title === "string"
		&& typeof value.url === "string"
		&& (!requireTrade2Urls || isTrade2Url(value.url))
		&& value.parentId === parentFolderId
		&& typeof value.dateAdded === "number"
		&& typeof value.updatedAt === "number"
	);
}

function isTrade2Url(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.origin === "https://www.pathofexile.com" && parsedUrl.pathname.startsWith("/trade2");
	} catch {
		return false;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
