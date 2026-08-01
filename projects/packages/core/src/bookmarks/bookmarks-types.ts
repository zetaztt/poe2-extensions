/**
 * 顶层书签树的稳定虚拟目录 ID；不对应可持久化、重命名或删除的普通目录。
 */
export const rootFolderId = "trade-bookmarks-root";

/**
 * 页面用于目录选择和编辑能力判断的轻量目录数据。
 */
export interface BookmarkFolderOption {
	id: string;
	title: string;
	parentId?: string;
	canModify: boolean;
}

/**
 * 页面消费的书签数据；只接受同源 trade2 URL。
 */
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

/**
 * 顶层一级目录；parentId 固定指向虚拟根目录。
 */
export interface TradeBookmarkFolder extends TradeBookmarkGroup {
	parentId?: string;
	canModify: boolean;
}

/**
 * 页面模型的虚拟根，只包含一级目录。
 */
export interface TradeBookmarkRoot {
	folders: TradeBookmarkFolder[];
}

/**
 * 页面消费的权威书签树快照；instanceId 用于隔离 background 重启后的 revision 序列。
 */
export interface TradeBookmarkTreeSnapshot {
	instanceId: string;
	revision: number;
	tree: TradeBookmarkRoot;
}

/**
 * mutation 的业务返回值和同一提交产生的权威树快照。
 */
export interface TradeBookmarkChangeResult<T> extends TradeBookmarkTreeSnapshot {
	value: T;
}

/**
 * 异步 storage.local 保存失败；snapshot 是失败版本，可能已经被更新广播取代。
 */
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

/**
 * storage.local 中的内部书签模型；与页面模型分离以保留持久化元数据。
 */
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

/**
 * storage.local 的版本化根对象；读取和写入边界都必须校验完整树结构。
 */
export interface StoredTradeBookmarkTree {
	version: 1;
	root: StoredTradeBookmarkRoot;
}

export type TradeBookmarkExportData = TradeBookmarkTreeExportData | TradeBookmarkFolderExportData;

/**
 * 书签导入导出的判别值，用于区分完整树和单目录载荷。
 */
export enum TradeBookmarkExportContent {
	Tree = "tree",
	Folder = "folder",
}

/**
 * 可导入的完整树格式；source 和 version 是外部文件兼容约定。
 */
export interface TradeBookmarkTreeExportData {
	source: "poe2-extensions-trade-bookmarks";
	exportedAt: number;
	content: TradeBookmarkExportContent.Tree;
	tree: StoredTradeBookmarkTree;
}

/**
 * 可导入的单目录格式；导入时与当前一级目录模型合并。
 */
export interface TradeBookmarkFolderExportData {
	source: "poe2-extensions-trade-bookmarks";
	exportedAt: number;
	content: TradeBookmarkExportContent.Folder;
	folder: StoredTradeBookmarkFolder;
}
