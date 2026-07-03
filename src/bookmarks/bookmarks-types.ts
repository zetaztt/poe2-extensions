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
	parentId?: string;
	children: StoredTradeBookmarkFolder[];
	bookmarks: StoredTradeBookmark[];
	createdAt: number;
	updatedAt: number;
}

export interface StoredTradeBookmarkTree {
	version: 1;
	root: StoredTradeBookmarkFolder;
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
