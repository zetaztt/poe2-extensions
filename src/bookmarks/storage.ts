import type {
	StoredTradeBookmark,
	StoredTradeBookmarkFolder,
	StoredTradeBookmarkTree,
} from './types';

export const rootFolderId = 'trade-bookmarks-root';

const tradeBookmarkTreeStorageKey = 'tradeBookmarkTree';
const rootFolderTitle = 'Trade 书签';
const storage = browser.storage.local;

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

	return value.children.every((child) => isStoredFolder(child))
		&& value.bookmarks.every(isStoredBookmark);
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
