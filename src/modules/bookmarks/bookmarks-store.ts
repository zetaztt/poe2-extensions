import { acceptHMRUpdate, defineStore } from "pinia";
import { ref, shallowRef } from "vue";
import { tradeBookmarkService } from "./bookmarks-service";
import {
	TradeBookmarkServiceErrorCode,
	type BookmarkFolderOption,
	type TradeBookmarkChangeResult,
	type TradeBookmarkExportData,
	type TradeBookmarkItem,
	type TradeBookmarkPersistenceError,
	type TradeBookmarkRoot,
	type TradeBookmarkTreeSnapshot,
} from "./bookmarks-types";

interface TradeBookmarkStoreError {
	sequence: number;
	code: TradeBookmarkServiceErrorCode;
	error: unknown;
}

export const useTradeBookmarkStore = defineStore("trade-bookmarks", () => {
	const bookmarkTree = ref<TradeBookmarkRoot | null>(null);
	const isLoadingBookmarks = ref(false);
	const lastError = shallowRef<TradeBookmarkStoreError | null>(null);

	// background 重启后 revision 会归零，instanceId 用于把新生命周期与旧广播区分开。
	let currentBackgroundInstanceId = "";
	let currentBookmarkRevision = -1;
	const retiredBackgroundInstanceIds = new Set<string>();
	let loadPromise: Promise<TradeBookmarkRoot> | null = null;
	let areBookmarkNotificationsInstalled = false;

	function clearError(): void {
		lastError.value = null;
	}

	function setError(code: TradeBookmarkServiceErrorCode, error: unknown): void {
		const sequence = (lastError.value?.sequence ?? 0) + 1;
		lastError.value = { sequence, code, error };
	}

	function loadTradeBookmarks(): Promise<TradeBookmarkRoot> {
		if (loadPromise) return loadPromise;

		ensureBookmarkNotificationsInstalled();
		const bookmarkTreeBeforeLoad = bookmarkTree.value;
		isLoadingBookmarks.value = true;
		loadPromise = tradeBookmarkService
			.loadTradeBookmarks()
			.then((snapshot) => applyBookmarkSnapshot(snapshot, true))
			.catch((error: unknown) => {
				// 加载期间若已收到更新广播，则保留较新的权威快照。
				if (bookmarkTree.value === bookmarkTreeBeforeLoad) bookmarkTree.value = null;
				setError(TradeBookmarkServiceErrorCode.LoadFailed, error);
				throw error;
			})
			.finally(() => {
				isLoadingBookmarks.value = false;
				loadPromise = null;
			});
		return loadPromise;
	}

	function createBookmarkFolder(parentId: string, title: string): Promise<BookmarkFolderOption> {
		return runBookmarkMutation(TradeBookmarkServiceErrorCode.CreateFolderFailed, () =>
			tradeBookmarkService.createBookmarkFolder(parentId, title),
		);
	}

	function renameBookmarkFolder(folderId: string, title: string): Promise<BookmarkFolderOption> {
		return runBookmarkMutation(TradeBookmarkServiceErrorCode.RenameFolderFailed, () =>
			tradeBookmarkService.renameBookmarkFolder(folderId, title),
		);
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

	async function deleteBookmarkFolder(folderId: string): Promise<void> {
		await runBookmarkMutation(TradeBookmarkServiceErrorCode.DeleteFolderFailed, () =>
			tradeBookmarkService.deleteBookmarkFolder(folderId),
		);
	}

	async function moveBookmarkFolder(folderId: string, targetParentId: string, targetIndex: number): Promise<void> {
		await runBookmarkMutation(TradeBookmarkServiceErrorCode.MoveFailed, () =>
			tradeBookmarkService.moveBookmarkFolder(folderId, targetParentId, targetIndex),
		);
	}

	function addCurrentTradeSearchBookmark(folderId: string): Promise<TradeBookmarkItem> {
		return runBookmarkMutation(TradeBookmarkServiceErrorCode.AddFailed, () =>
			tradeBookmarkService.addCurrentTradeSearchBookmark(folderId),
		);
	}

	function renameTradeBookmark(bookmarkId: string, title: string): Promise<TradeBookmarkItem> {
		return runBookmarkMutation(TradeBookmarkServiceErrorCode.RenameFailed, () =>
			tradeBookmarkService.renameTradeBookmark(bookmarkId, title),
		);
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

	async function deleteTradeBookmark(bookmarkId: string): Promise<void> {
		await runBookmarkMutation(TradeBookmarkServiceErrorCode.DeleteFailed, () =>
			tradeBookmarkService.deleteTradeBookmark(bookmarkId),
		);
	}

	async function moveTradeBookmark(bookmarkId: string, targetFolderId: string, targetIndex: number): Promise<void> {
		await runBookmarkMutation(TradeBookmarkServiceErrorCode.MoveFailed, () =>
			tradeBookmarkService.moveTradeBookmark(bookmarkId, targetFolderId, targetIndex),
		);
	}

	function replaceTradeBookmarkWithCurrentSearch(bookmarkId: string): Promise<TradeBookmarkItem> {
		return runBookmarkMutation(TradeBookmarkServiceErrorCode.ReplaceFailed, () =>
			tradeBookmarkService.replaceTradeBookmarkWithCurrentSearch(bookmarkId),
		);
	}

	function exportBookmarkTree(): Promise<TradeBookmarkExportData> {
		ensureBookmarkNotificationsInstalled();
		return tradeBookmarkService.exportBookmarkTree();
	}

	function exportBookmarkFolder(folderId: string): Promise<TradeBookmarkExportData> {
		ensureBookmarkNotificationsInstalled();
		return tradeBookmarkService.exportBookmarkFolder(folderId);
	}

	async function importBookmarkData(value: unknown): Promise<void> {
		ensureBookmarkNotificationsInstalled();
		const result = await tradeBookmarkService.importBookmarkData(value);
		applyBookmarkSnapshot(result);
	}

	function openTradeBookmark(url: string): Promise<void> {
		return tradeBookmarkService.openTradeBookmark(url);
	}

	function getTradeBookmarkServiceErrorMessage(code: TradeBookmarkServiceErrorCode): string {
		return tradeBookmarkService.getTradeBookmarkServiceErrorMessage(code);
	}

	async function runBookmarkMutation<T>(
		errorCode: TradeBookmarkServiceErrorCode,
		invoke: () => Promise<TradeBookmarkChangeResult<T>>,
	): Promise<T> {
		ensureBookmarkNotificationsInstalled();

		try {
			const result = await invoke();
			applyBookmarkSnapshot(result);
			return result.value;
		} catch (error) {
			setError(errorCode, error);
			throw error;
		}
	}

	function ensureBookmarkNotificationsInstalled(): void {
		if (areBookmarkNotificationsInstalled) return;
		areBookmarkNotificationsInstalled = true;
		tradeBookmarkService.subscribeTradeBookmarks(
			(snapshot) => applyBookmarkSnapshot(snapshot),
			onBookmarkPersistenceFailed,
		);
	}

	function applyBookmarkSnapshot(snapshot: TradeBookmarkTreeSnapshot, force = false): TradeBookmarkRoot {
		if (retiredBackgroundInstanceIds.has(snapshot.instanceId)) return bookmarkTree.value ?? snapshot.tree;

		const isNewBackgroundInstance = snapshot.instanceId !== currentBackgroundInstanceId;
		const isNewerRevision = snapshot.revision > currentBookmarkRevision;
		const isOlderRevision = snapshot.revision < currentBookmarkRevision;
		if (!isNewBackgroundInstance && isOlderRevision) return bookmarkTree.value ?? snapshot.tree;
		if (!force && !isNewBackgroundInstance && !isNewerRevision) return bookmarkTree.value ?? snapshot.tree;

		if (force || isNewBackgroundInstance || isNewerRevision || !bookmarkTree.value) {
			if (isNewBackgroundInstance && currentBackgroundInstanceId) {
				retiredBackgroundInstanceIds.add(currentBackgroundInstanceId);
			}
			currentBackgroundInstanceId = snapshot.instanceId;
			currentBookmarkRevision = snapshot.revision;
			bookmarkTree.value = snapshot.tree;
		}
		clearError();
		return bookmarkTree.value ?? snapshot.tree;
	}

	function onBookmarkPersistenceFailed(error: TradeBookmarkPersistenceError): void {
		if (currentBackgroundInstanceId && error.instanceId !== currentBackgroundInstanceId) return;
		setError(TradeBookmarkServiceErrorCode.PersistenceFailed, new Error(error.message));
	}

	async function reloadAfterOptimisticUpdateFailure(): Promise<void> {
		try {
			await loadTradeBookmarks();
		} catch (error) {
			// loadTradeBookmarks 已记录新的错误；这里保留原重命名异常作为 action 的拒绝原因。
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

	return {
		bookmarkTree,
		isLoadingBookmarks,
		lastError,
		loadTradeBookmarks,
		createBookmarkFolder,
		renameFolderOptimistically,
		deleteBookmarkFolder,
		moveBookmarkFolder,
		addCurrentTradeSearchBookmark,
		renameBookmarkOptimistically,
		deleteTradeBookmark,
		moveTradeBookmark,
		replaceTradeBookmarkWithCurrentSearch,
		exportBookmarkTree,
		exportBookmarkFolder,
		importBookmarkData,
		openTradeBookmark,
		getTradeBookmarkServiceErrorMessage,
	};
});

if (import.meta.hot) {
	import.meta.hot.accept(acceptHMRUpdate(useTradeBookmarkStore, import.meta.hot));
}
