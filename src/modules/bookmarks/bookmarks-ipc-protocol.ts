import { defineIpcProtocol, defineNotification, defineRpc } from "../../ipc/ipc-protocol";
import type {
	BookmarkFolderOption,
	TradeBookmarkChangeResult,
	TradeBookmarkExportData,
	TradeBookmarkFolder,
	TradeBookmarkGroup,
	TradeBookmarkItem,
	TradeBookmarkPersistenceError,
	TradeBookmarkRoot,
	TradeBookmarkTreeSnapshot,
} from "./bookmarks-types";

export const bookmarksIpcProtocol = defineIpcProtocol({
	name: "bookmarks",
	load: defineRpc<void, TradeBookmarkTreeSnapshot>(),
	getRootGroups: defineRpc<void, TradeBookmarkGroup[]>(),
	getRootTree: defineRpc<void, TradeBookmarkRoot>(),
	getGroups: defineRpc<{ folderId: string }, TradeBookmarkGroup[]>(),
	getTree: defineRpc<{ folderId: string }, TradeBookmarkRoot | TradeBookmarkFolder | null>(),
	createFolder: defineRpc<{ parentId: string; title: string }, TradeBookmarkChangeResult<BookmarkFolderOption>>(),
	renameFolder: defineRpc<{ folderId: string; title: string }, TradeBookmarkChangeResult<BookmarkFolderOption>>(),
	deleteFolder: defineRpc<{ folderId: string }, TradeBookmarkChangeResult<null>>(),
	moveFolder: defineRpc<
		{ folderId: string; targetParentId: string; targetIndex: number },
		TradeBookmarkChangeResult<null>
	>(),
	addCurrentSearch: defineRpc<
		{ folderId: string; title?: string; url: string },
		TradeBookmarkChangeResult<TradeBookmarkItem>
	>(),
	renameBookmark: defineRpc<{ bookmarkId: string; title: string }, TradeBookmarkChangeResult<TradeBookmarkItem>>(),
	deleteBookmark: defineRpc<{ bookmarkId: string }, TradeBookmarkChangeResult<null>>(),
	moveBookmark: defineRpc<
		{ bookmarkId: string; targetFolderId: string; targetIndex: number },
		TradeBookmarkChangeResult<null>
	>(),
	replaceBookmark: defineRpc<{ bookmarkId: string; url: string }, TradeBookmarkChangeResult<TradeBookmarkItem>>(),
	exportTree: defineRpc<void, TradeBookmarkExportData>(),
	exportFolder: defineRpc<{ folderId: string }, TradeBookmarkExportData>(),
	importData: defineRpc<{ value: unknown }, TradeBookmarkChangeResult<null>>(),
	changed: defineNotification<TradeBookmarkTreeSnapshot>(),
	persistenceFailed: defineNotification<TradeBookmarkPersistenceError>(),
});
