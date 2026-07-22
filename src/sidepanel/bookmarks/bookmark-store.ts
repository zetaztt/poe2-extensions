import { computed, readonly, ref, shallowRef } from "vue";
import {
	getCurrentTradeBookmarkTree,
	getTradeBookmarkServiceErrorCode,
	isTradeBookmarkServiceLoading,
	loadTradeBookmarks,
	renameBookmarkFolder,
	renameTradeBookmark,
	subscribeTradeBookmarks,
	TradeBookmarkServiceErrorCode,
	TradeBookmarkServiceEventType,
	type TradeBookmarkServiceEvent,
} from "../../bookmarks/bookmarks-service";
import type { TradeBookmarkItem, TradeBookmarkRoot } from "../../bookmarks/bookmarks-types";

export interface TradeBookmarkStoreError {
	sequence: number;
	code: TradeBookmarkServiceErrorCode;
	error: unknown;
}

const bookmarkTree = ref<TradeBookmarkRoot | null>(getCurrentTradeBookmarkTree());
const isLoadingBookmarks = ref(isTradeBookmarkServiceLoading());
const lastError = shallowRef<TradeBookmarkStoreError | null>(createInitialError());
let errorSequence = lastError.value?.sequence ?? 0;
let loadPromise: Promise<TradeBookmarkRoot> | null = null;
let isSubscribed = false;

// computed 只封闭 ref 的写入口，同时保留业务模型类型，避免把所有子节点转换成 DeepReadonly。
const readonlyBookmarkTree = computed<TradeBookmarkRoot | null>(() => bookmarkTree.value);
const readonlyIsLoadingBookmarks = readonly(isLoadingBookmarks);
const readonlyLastError = readonly(lastError);

export function useTradeBookmarkStore() {
	ensureSubscribed();

	return {
		bookmarkTree: readonlyBookmarkTree,
		isLoadingBookmarks: readonlyIsLoadingBookmarks,
		lastError: readonlyLastError,
		loadBookmarks,
		renameFolderOptimistically,
		renameBookmarkOptimistically,
	};
}

function loadBookmarks(): Promise<TradeBookmarkRoot> {
	if (loadPromise) return loadPromise;

	isLoadingBookmarks.value = true;
	loadPromise = loadTradeBookmarks()
		.then((tree) => {
			bookmarkTree.value = tree;
			return tree;
		})
		.catch((error: unknown) => {
			bookmarkTree.value = null;
			throw error;
		})
		.finally(() => {
			isLoadingBookmarks.value = false;
			loadPromise = null;
		});

	return loadPromise;
}

async function renameFolderOptimistically(folderId: string, title: string): Promise<void> {
	const folder = bookmarkTree.value?.folders.find((item) => item.id === folderId);
	if (folder) folder.title = normalizeFolderTitle(title);

	try {
		await renameBookmarkFolder(folderId, title);
	} catch (error) {
		await reloadAfterOptimisticUpdateFailure();
		throw error;
	}
}

async function renameBookmarkOptimistically(bookmarkId: string, title: string): Promise<void> {
	const bookmark = findBookmark(bookmarkId);
	if (bookmark) bookmark.title = normalizeBookmarkTitle(title, bookmark.url);

	try {
		await renameTradeBookmark(bookmarkId, title);
	} catch (error) {
		await reloadAfterOptimisticUpdateFailure();
		throw error;
	}
}

function ensureSubscribed(): void {
	if (isSubscribed) return;
	isSubscribed = true;
	subscribeTradeBookmarks(onTradeBookmarkServiceEvent);
}

function onTradeBookmarkServiceEvent(event: TradeBookmarkServiceEvent): void {
	if (event.type === TradeBookmarkServiceEventType.Loaded || event.type === TradeBookmarkServiceEventType.Changed) {
		bookmarkTree.value = event.tree;
		lastError.value = null;
		return;
	}

	errorSequence += 1;
	lastError.value = {
		sequence: errorSequence,
		code: event.code,
		error: event.error,
	};
}

async function reloadAfterOptimisticUpdateFailure(): Promise<void> {
	try {
		await loadBookmarks();
	} catch (error) {
		// loadBookmarks 已发布新的 service 错误；这里保留原重命名异常作为 action 的拒绝原因。
		console.error("[poe2-extensions] trade 书签乐观更新回滚失败", error);
	}
}

function findBookmark(bookmarkId: string): TradeBookmarkItem | null {
	for (const folder of bookmarkTree.value?.folders ?? []) {
		const bookmark = folder.bookmarks.find((item) => item.id === bookmarkId);
		if (bookmark) return bookmark;
	}

	return null;
}

function normalizeFolderTitle(title: string): string {
	return title.trim() || "New Folder";
}

function normalizeBookmarkTitle(title: string, url: string): string {
	const trimmedTitle = title.trim();
	if (trimmedTitle) return trimmedTitle;

	try {
		const queryId = new URL(url).pathname.split("/").filter(Boolean).pop();
		return queryId ? `Trade 搜索 ${queryId}` : "Trade 搜索";
	} catch {
		return "Trade 搜索";
	}
}

function createInitialError(): TradeBookmarkStoreError | null {
	const code = getTradeBookmarkServiceErrorCode();
	if (code === TradeBookmarkServiceErrorCode.None) return null;

	return {
		sequence: 1,
		code,
		error: null,
	};
}
