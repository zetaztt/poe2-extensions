export const rootFolderId = "trade-bookmarks-root";

export interface BookmarkFolderOption {
	id: string;
	title: string;
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
	bookmarks: TradeBookmarkItem[];
}

export interface TradeBookmarkFolder extends TradeBookmarkGroup {
	parentId?: string;
	canModify: boolean;
}

export interface TradeBookmarkRoot {
	folders: TradeBookmarkFolder[];
}

export interface TradeBookmarkTreeSnapshot {
	instanceId: string;
	revision: number;
	tree: TradeBookmarkRoot;
}

export interface TradeBookmarkChangeResult<T> extends TradeBookmarkTreeSnapshot {
	value: T;
}

export interface TradeBookmarkPersistenceError {
	instanceId: string;
	revision: number;
	message: string;
}

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
	PersistenceFailed = 10,
}

export interface StoredTradeBookmark {
	id: string;
	title: string;
	url: string;
	parentId: string;
	dateAdded: number;
	updatedAt: number;
}

export interface StoredTradeBookmarkFolder {
	id: string;
	title: string;
	parentId: string;
	bookmarks: StoredTradeBookmark[];
	createdAt: number;
	updatedAt: number;
}

export interface StoredTradeBookmarkRoot {
	folders: StoredTradeBookmarkFolder[];
	createdAt: number;
	updatedAt: number;
}

export interface StoredTradeBookmarkTree {
	version: 1;
	root: StoredTradeBookmarkRoot;
}

export type TradeBookmarkExportData = TradeBookmarkTreeExportData | TradeBookmarkFolderExportData;

export enum TradeBookmarkExportContent {
	Tree = "tree",
	Folder = "folder",
}

export interface TradeBookmarkTreeExportData {
	source: "poe2-extensions-trade-bookmarks";
	exportedAt: number;
	content: TradeBookmarkExportContent.Tree;
	tree: StoredTradeBookmarkTree;
}

export interface TradeBookmarkFolderExportData {
	source: "poe2-extensions-trade-bookmarks";
	exportedAt: number;
	content: TradeBookmarkExportContent.Folder;
	folder: StoredTradeBookmarkFolder;
}
