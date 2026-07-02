import browser from "webextension-polyfill";
import type {
	StoredTradeBookmark,
	StoredTradeBookmarkFolder,
	StoredTradeBookmarkTree,
	TradeBookmarkExportData,
	TradeBookmarkImportMode,
} from "./bookmarks-types";

export const rootFolderId = "trade-bookmarks-root";

const tradeBookmarkTreeStorageKey = "tradeBookmarkTree";
const tradeBookmarkExportSource = "poe2-extensions-trade-bookmarks";
const rootFolderTitle = "Trade 书签";
const storage = browser.storage.local;

type BookmarkImportData =
	| { content: "tree"; tree: StoredTradeBookmarkTree }
	| { content: "folder"; folder: StoredTradeBookmarkFolder };

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
		content: "tree",
		tree: structuredClone(await getBookmarkTree()),
	};
}

export async function exportBookmarkFolder(folderId: string): Promise<TradeBookmarkExportData> {
	const tree = await getBookmarkTree();
	const folder = findFolder(tree.root, folderId);
	if (!folder || folder.id === rootFolderId) throw new Error("未找到可导出的书签文件夹。");

	return {
		source: tradeBookmarkExportSource,
		exportedAt: Date.now(),
		content: "folder",
		folder: structuredClone(folder),
	};
}

export async function importBookmarkData(value: unknown, mode: TradeBookmarkImportMode): Promise<void> {
	const data = getImportBookmarkData(value);
	if (!data) throw new Error("导入文件不是有效的 trade2 书签备份。");

	if (mode === "replace") {
		await saveBookmarkTree(createReplacementBookmarkTree(data));
		return;
	}

	const tree = await getBookmarkTree();
	const importedFolders = getImportFolders(data).map((folder) => cloneFolderForParent(folder, rootFolderId));
	const now = Date.now();
	tree.root.children.push(...importedFolders);
	tree.root.updatedAt = now;
	await saveBookmarkTree(tree);
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

function createReplacementBookmarkTree(data: BookmarkImportData): StoredTradeBookmarkTree {
	if (data.content === "tree") return structuredClone(data.tree);

	const tree = createDefaultBookmarkTree();
	tree.root.children = [cloneFolderForParent(data.folder, rootFolderId)];
	tree.root.updatedAt = Date.now();
	return tree;
}

function getImportFolders(data: BookmarkImportData): StoredTradeBookmarkFolder[] {
	return data.content === "tree" ? data.tree.root.children : [data.folder];
}

function getImportBookmarkData(value: unknown): BookmarkImportData | null {
	if (!isRecord(value)) return null;

	if (value.source === tradeBookmarkExportSource && typeof value.exportedAt === "number") {
		if (value.content === "folder" && isStoredFolder(value.folder, 1, true)) {
			return { content: "folder", folder: value.folder };
		}

		if ((value.content === "tree" || value.content === undefined) && isStoredBookmarkTree(value.tree, true)) {
			return { content: "tree", tree: value.tree };
		}

		return null;
	}

	if (isStoredBookmarkTree(value, true)) return { content: "tree", tree: value };
	return null;
}

function cloneFolderForParent(
	folder: StoredTradeBookmarkFolder,
	parentId: string | undefined,
): StoredTradeBookmarkFolder {
	const folderId = createId("folder");
	return {
		...structuredClone(folder),
		id: folderId,
		parentId,
		children: folder.children.map((child) => cloneFolderForParent(child, folderId)),
		bookmarks: folder.bookmarks.map((bookmark) => ({
			...bookmark,
			id: createId("bookmark"),
			parentId: folderId,
		})),
	};
}

function findFolder(folder: StoredTradeBookmarkFolder, folderId: string): StoredTradeBookmarkFolder | null {
	if (folder.id === folderId) return folder;

	for (const child of folder.children) {
		const match = findFolder(child, folderId);
		if (match) return match;
	}

	return null;
}

function isStoredBookmarkTree(value: unknown, requireTrade2Urls = false): value is StoredTradeBookmarkTree {
	if (!isRecord(value) || value.version !== 1) return false;
	if (!isRecord(value.root) || value.root.id !== rootFolderId) return false;
	return isStoredFolder(value.root, 0, requireTrade2Urls);
}

function isStoredFolder(value: unknown, depth: number, requireTrade2Urls: boolean): value is StoredTradeBookmarkFolder {
	if (!isRecord(value)) return false;
	if (typeof value.id !== "string" || typeof value.title !== "string") return false;
	if (depth === 0 && value.parentId !== undefined) return false;
	if (depth === 1 && value.parentId !== rootFolderId) return false;
	if (depth > 0 && typeof value.parentId !== "string") return false;
	if (typeof value.createdAt !== "number" || typeof value.updatedAt !== "number") return false;
	const folderId = value.id;
	if (!Array.isArray(value.children) || !Array.isArray(value.bookmarks)) return false;
	if (depth === 0 && value.bookmarks.length > 0) return false;
	if (depth > 0 && value.children.length > 0) return false;

	return (
		value.children.every((child) => isStoredFolder(child, depth + 1, requireTrade2Urls))
		&& value.bookmarks.every((bookmark) => isStoredBookmark(bookmark, folderId, requireTrade2Urls))
	);
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

function createId(prefix: "folder" | "bookmark"): string {
	const randomId =
		globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
	return `${prefix}-${randomId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
