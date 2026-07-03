<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
	addCurrentTradeSearchBookmark,
	createBookmarkFolder,
	deleteBookmarkFolder,
	deleteTradeBookmark,
	getCurrentTradeBookmarkTree,
	getTradeBookmarkServiceErrorCode,
	getTradeBookmarkServiceErrorMessage,
	isTradeBookmarkServiceLoading,
	loadTradeBookmarks,
	moveBookmarkFolder,
	moveTradeBookmark,
	openTradeBookmark,
	renameBookmarkFolder,
	renameTradeBookmark,
	replaceTradeBookmarkWithCurrentSearch,
	subscribeTradeBookmarks,
	TradeBookmarkServiceEventType,
	type TradeBookmarkServiceEvent,
} from "../../bookmarks/bookmarks-service";
import {
	exportBookmarkFolder,
	exportBookmarkTree,
	importBookmarkData,
	rootFolderId,
} from "../../bookmarks/bookmarks-storage";
import {
	type TradeBookmarkFolder,
	type TradeBookmarkItem,
	type TradeBookmarkRoot,
} from "../../bookmarks/bookmarks-types";
import {
	closeMenu,
	openMenu as openSidepanelMenu,
	SidepanelMenuAlign,
	type SidepanelMenuItem,
	type SidepanelMenuOptions,
} from "../common/menu/sidepanel-menu";
import BookmarkFolder from "./bookmark-folder.vue";
import BookmarkItem from "./bookmark-item.vue";
import BookmarkTreeHeader from "./bookmark-tree-header.vue";

enum BookmarkDragItemType {
	Folder = 1,
	Bookmark = 2,
}

enum BookmarkDropPosition {
	Before = 1,
	Inside = 2,
	After = 3,
}

type DragItem = { type: BookmarkDragItemType.Folder; id: string } | { type: BookmarkDragItemType.Bookmark; id: string };

type DropTarget =
	| { type: BookmarkDragItemType.Folder; id: string; position: BookmarkDropPosition }
	| {
			type: BookmarkDragItemType.Bookmark;
			id: string;
			folderId: string;
			position: BookmarkDropPosition.Before | BookmarkDropPosition.After;
	  };

const props = defineProps<{
	active: boolean;
	onInitialized?: (success: boolean) => void;
}>();

const bookmarkTree = ref<TradeBookmarkRoot | null>(null);
const isLoadingBookmarks = ref(true);
const expandedFolderIds = ref<Set<string>>(new Set());
const renamingFolderId = ref("");
const renamingFolderTitle = ref("");
const renamingBookmarkId = ref("");
const renamingBookmarkTitle = ref("");
const creatingFolderId = ref("");
const creatingBookmarkId = ref("");
const statusText = ref("");
const isBusy = ref(false);
const importFileInput = ref<HTMLInputElement | null>(null);
const skipNextFolderRenameBlur = ref(false);
const skipNextBookmarkRenameBlur = ref(false);
const dragItem = ref<DragItem | null>(null);
const dropTarget = ref<DropTarget | null>(null);
let pendingRenamePromise: Promise<void> | null = null;
let unsubscribeTradeBookmarks: (() => void) | null = null;

const rootBookmarkFolder = computed<TradeBookmarkRoot | null>(() => bookmarkTree.value);
const visibleBookmarkFolders = computed<TradeBookmarkFolder[]>(() => bookmarkTree.value?.folders ?? []);

watch(
	bookmarkTree,
	(tree) => {
		const previousExpandedIds = expandedFolderIds.value;
		const nextFolderIds = new Set(tree ? tree.folders.map((folder) => folder.id) : []);
		const nextExpandedIds = new Set<string>();

		for (const folderId of previousExpandedIds) {
			if (nextFolderIds.has(folderId)) nextExpandedIds.add(folderId);
		}

		if (tree && previousExpandedIds.size === 0) {
			for (const folderId of nextFolderIds) nextExpandedIds.add(folderId);
		}

		expandedFolderIds.value = nextExpandedIds;
	},
	{ immediate: true },
);

watch(
	() => props.active,
	(active) => {
		if (active) void loadBookmarks();
	},
);

onMounted(() => {
	syncTradeBookmarkServiceState();
	unsubscribeTradeBookmarks = subscribeTradeBookmarks(onTradeBookmarkServiceEvent);
	void loadBookmarks();
});

onBeforeUnmount(() => {
	unsubscribeTradeBookmarks?.();
	unsubscribeTradeBookmarks = null;
});

function syncTradeBookmarkServiceState(): void {
	bookmarkTree.value = getCurrentTradeBookmarkTree();
	isLoadingBookmarks.value = isTradeBookmarkServiceLoading();
	statusText.value = getTradeBookmarkServiceErrorMessage(getTradeBookmarkServiceErrorCode());
}

function onTradeBookmarkServiceEvent(event: TradeBookmarkServiceEvent): void {
	if (event.type === TradeBookmarkServiceEventType.Loaded || event.type === TradeBookmarkServiceEventType.Changed) {
		bookmarkTree.value = event.tree;
		return;
	}

	statusText.value = getTradeBookmarkServiceErrorMessage(event.code);
}

async function loadBookmarks(): Promise<void> {
	isLoadingBookmarks.value = true;

	try {
		bookmarkTree.value = await loadTradeBookmarks();
		props.onInitialized?.(true);
	} catch (error) {
		bookmarkTree.value = null;
		statusText.value = "本地书签读取失败，请稍后重试。";
		props.onInitialized?.(false);
		console.error("[poe2-extensions] trade 书签读取失败", error);
	} finally {
		isLoadingBookmarks.value = false;
	}
}

async function onExportBookmarks(folder?: TradeBookmarkFolder): Promise<void> {
	if (isBusy.value) return;
	await flushPendingRename();
	if (isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		const data = folder ? await exportBookmarkFolder(folder.id) : await exportBookmarkTree();
		const blob = new Blob([JSON.stringify(data, null, "\t")], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = getBookmarkExportFileName(data, folder);
		link.style.display = "none";
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
		statusText.value = folder ? "文件夹 JSON 已导出。" : "书签 JSON 已导出。";
	} catch (error) {
		statusText.value = "导出书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签导出失败", error);
	} finally {
		isBusy.value = false;
	}
}

async function onImportBookmarksClick(): Promise<void> {
	if (isBusy.value) return;
	await flushPendingRename();
	if (isBusy.value) return;

	statusText.value = "";
	importFileInput.value?.click();
}

async function onImportBookmarksChange(event: Event): Promise<void> {
	const input = event.target instanceof HTMLInputElement ? event.target : null;
	const file = input?.files?.[0];
	if (input) input.value = "";
	if (!file || isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		const data: unknown = JSON.parse(await file.text());
		await importBookmarkData(data);
		await loadBookmarks();
		statusText.value = "书签 JSON 已同步。";
	} catch (error) {
		statusText.value = error instanceof Error ? error.message : "导入书签失败，请确认 JSON 文件有效。";
		console.error("[poe2-extensions] trade 书签导入失败", error);
	} finally {
		isBusy.value = false;
	}
}

function getBookmarkExportFileName(data: { exportedAt: number }, folder: TradeBookmarkFolder | undefined): string {
	const scope = folder ? `folder-${getSafeFileName(folder.title)}` : "all";
	return `poe2-trade-bookmarks-${scope}-${formatExportDate(data.exportedAt)}.json`;
}

function getSafeFileName(value: string): string {
	return (
		value
			.trim()
			.replace(/[<>:"/\\|?*]+/g, "-")
			.replace(/\s+/g, "-") || "folder"
	);
}

function formatExportDate(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear().toString();
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	const day = date.getDate().toString().padStart(2, "0");
	const hour = date.getHours().toString().padStart(2, "0");
	const minute = date.getMinutes().toString().padStart(2, "0");
	const second = date.getSeconds().toString().padStart(2, "0");
	return `${year}${month}${day}-${hour}${minute}${second}`;
}

function isFolderExpanded(folder: TradeBookmarkFolder): boolean {
	return expandedFolderIds.value.has(folder.id);
}

function hasFolderContent(folder: TradeBookmarkFolder): boolean {
	return folder.bookmarks.length > 0;
}

function toggleFolderExpanded(folder: TradeBookmarkFolder): void {
	if (!hasFolderContent(folder)) return;

	const nextExpandedIds = new Set(expandedFolderIds.value);
	if (nextExpandedIds.has(folder.id)) {
		nextExpandedIds.delete(folder.id);
	} else {
		nextExpandedIds.add(folder.id);
	}

	expandedFolderIds.value = nextExpandedIds;
}
function collapseAllFolders(): void {
	statusText.value = "";
	expandedFolderIds.value = new Set();
}

function collapseOtherFolders(folder: TradeBookmarkFolder): void {
	statusText.value = "";
	expandedFolderIds.value = new Set([folder.id]);
}

async function openRootFolderMenu(event: MouseEvent, folder: TradeBookmarkRoot): Promise<void> {
	await openBookmarkMenu(event, getButtonMenuPosition(event), getRootFolderMenuItems());
}

async function openFolderMenu(event: MouseEvent, folder: TradeBookmarkFolder): Promise<void> {
	await openBookmarkMenu(event, getButtonMenuPosition(event), getFolderMenuItems(folder));
}

async function openBookmarkItemMenu(event: MouseEvent, bookmark: TradeBookmarkItem): Promise<void> {
	await openBookmarkMenu(event, getButtonMenuPosition(event), getBookmarkMenuItems(bookmark));
}

async function openRootFolderContextMenu(event: MouseEvent, folder: TradeBookmarkRoot): Promise<void> {
	await openBookmarkMenu(event, { x: event.clientX, y: event.clientY }, getRootFolderMenuItems());
}

async function openFolderContextMenu(event: MouseEvent, folder: TradeBookmarkFolder): Promise<void> {
	await openBookmarkMenu(event, { x: event.clientX, y: event.clientY }, getFolderMenuItems(folder));
}

async function openBookmarkContextMenu(event: MouseEvent, bookmark: TradeBookmarkItem): Promise<void> {
	await openBookmarkMenu(event, { x: event.clientX, y: event.clientY }, getBookmarkMenuItems(bookmark));
}

async function openBookmarkMenu(
	event: MouseEvent,
	position: SidepanelMenuOptions,
	items: SidepanelMenuItem[],
): Promise<void> {
	if (isBusy.value) return;

	event.preventDefault();
	event.stopPropagation();
	await flushPendingRename();
	if (isBusy.value) return;

	statusText.value = "";
	openSidepanelMenu(items, position);
}

function getButtonMenuPosition(event: MouseEvent): SidepanelMenuOptions {
	const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	const fallbackTarget = event.target instanceof HTMLElement ? event.target.closest("button") : null;
	const element = target ?? fallbackTarget;
	if (!element) return { x: event.clientX, y: event.clientY };

	const rect = element.getBoundingClientRect();
	return {
		x: rect.right,
		y: rect.bottom + 1,
		align: SidepanelMenuAlign.End,
	};
}

function getRootFolderMenuItems(): SidepanelMenuItem[] {
	return [
		{ id: "create", label: "添加文件夹", run: () => onCreateFolder(rootFolderId) },
		{ id: "import", label: "导入 JSON", run: onImportBookmarksClick },
		{ id: "export", label: "导出全部 JSON", run: () => onExportBookmarks() },
		{ id: "collapse-all", label: "折叠所有", run: collapseAllFolders },
	];
}

function getFolderMenuItems(folder: TradeBookmarkFolder): SidepanelMenuItem[] {
	return [
		{ id: "add-bookmark", label: "添加当前搜索", run: () => addCurrentSearchToFolder(folder.id) },
		{ id: "collapse-others", label: "折叠其他文件夹", run: () => collapseOtherFolders(folder) },
		{ id: "export", label: "导出文件夹 JSON", run: () => onExportBookmarks(folder) },
		{
			id: "rename",
			label: "重命名",
			disabled: !folder.canModify,
			run: () => startRenameFolder(folder),
		},
		{
			id: "delete",
			label: "删除",
			disabled: !folder.canModify,
			run: () => onDeleteFolder(folder),
		},
	];
}

function getBookmarkMenuItems(bookmark: TradeBookmarkItem): SidepanelMenuItem[] {
	return [
		{ id: "rename", label: "重命名", run: () => startRenameBookmark(bookmark) },
		{ id: "replace", label: "用当前搜索替换", run: () => onReplaceBookmark(bookmark) },
		{ id: "delete", label: "删除", run: () => onDeleteBookmark(bookmark) },
	];
}

async function addCurrentSearchToFolder(folderId: string): Promise<void> {
	if (isBusy.value) return;
	await flushPendingRename();
	if (isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		const bookmark = await addCurrentTradeSearchBookmark(folderId);
		expandFolder(folderId);
		creatingBookmarkId.value = bookmark.id;
		renamingBookmarkId.value = bookmark.id;
		renamingBookmarkTitle.value = bookmark.title;
	} catch (error) {
		statusText.value = error instanceof Error ? error.message : "添加书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 搜索书签添加失败", error);
	} finally {
		isBusy.value = false;
	}
}

async function onCreateFolder(parentId: string): Promise<void> {
	if (isBusy.value) return;
	await flushPendingRename();
	if (isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		const folder = await createBookmarkFolder(parentId, "New Folder");
		expandFolder(parentId);
		creatingFolderId.value = folder.id;
		renamingFolderId.value = folder.id;
		renamingFolderTitle.value = folder.title;
	} catch (error) {
		statusText.value = "新建文件夹失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签目录创建失败", error);
	} finally {
		isBusy.value = false;
	}
}

async function startRenameFolder(folder: TradeBookmarkFolder): Promise<void> {
	if (!folder.canModify) return;
	await flushPendingRename();
	await cancelBookmarkRename();
	renamingFolderId.value = folder.id;
	renamingFolderTitle.value = folder.title;
}

async function confirmRenameFolder(): Promise<void> {
	const pendingRename = queueFolderRename();
	if (pendingRename) await pendingRename;
}

async function cancelFolderRename(): Promise<void> {
	const folderId = renamingFolderId.value;
	if (folderId && folderId === creatingFolderId.value) {
		await cancelCreatedFolder(folderId);
		return;
	}

	clearFolderRename();
}

async function cancelCreatedFolder(folderId: string): Promise<void> {
	skipNextFolderRenameBlur.value = true;
	isBusy.value = true;
	statusText.value = "";

	try {
		await deleteBookmarkFolder(folderId);
		creatingFolderId.value = "";
		clearFolderRename();
	} catch (error) {
		statusText.value = "取消新建文件夹失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签目录取消创建失败", error);
	} finally {
		isBusy.value = false;
	}
}

function onFolderRenameBlur(): void {
	if (skipNextFolderRenameBlur.value) {
		skipNextFolderRenameBlur.value = false;
		return;
	}

	queueFolderRename();
}

async function onDeleteFolder(folder: TradeBookmarkFolder): Promise<void> {
	if (!folder.canModify || isBusy.value) return;
	await flushPendingRename();
	if (isBusy.value) return;
	if (!window.confirm(`确定删除“${folder.title}”及其所有内容吗？`)) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		await deleteBookmarkFolder(folder.id);
		removeExpandedFolder(folder.id);
	} catch (error) {
		statusText.value = "删除文件夹失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签目录删除失败", error);
	} finally {
		isBusy.value = false;
	}
}

async function startRenameBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	await flushPendingRename();
	await cancelFolderRename();
	renamingBookmarkId.value = bookmark.id;
	renamingBookmarkTitle.value = bookmark.title;
}

async function confirmRenameBookmark(): Promise<void> {
	const pendingRename = queueBookmarkRename();
	if (pendingRename) await pendingRename;
}

async function cancelBookmarkRename(): Promise<void> {
	const bookmarkId = renamingBookmarkId.value;
	if (bookmarkId && bookmarkId === creatingBookmarkId.value) {
		await cancelCreatedBookmark(bookmarkId);
		return;
	}

	clearBookmarkRename();
}

async function cancelCreatedBookmark(bookmarkId: string): Promise<void> {
	skipNextBookmarkRenameBlur.value = true;
	isBusy.value = true;
	statusText.value = "";

	try {
		await deleteTradeBookmark(bookmarkId);
		creatingBookmarkId.value = "";
		clearBookmarkRename();
	} catch (error) {
		statusText.value = "取消新建书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签取消创建失败", error);
	} finally {
		isBusy.value = false;
	}
}

function onBookmarkRenameBlur(): void {
	if (skipNextBookmarkRenameBlur.value) {
		skipNextBookmarkRenameBlur.value = false;
		return;
	}

	queueBookmarkRename();
}

async function onOpenBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	await flushPendingRename();
	try {
		await openTradeBookmark(bookmark.url);
	} catch (error) {
		statusText.value = "打开书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签打开失败", error);
	}
}

async function onReplaceBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	if (isBusy.value) return;
	await flushPendingRename();
	if (isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		await replaceTradeBookmarkWithCurrentSearch(bookmark.id);
		statusText.value = "书签链接已替换为当前搜索。";
	} catch (error) {
		statusText.value = error instanceof Error ? error.message : "替换书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签替换失败", error);
	} finally {
		isBusy.value = false;
	}
}

async function onDeleteBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	if (isBusy.value) return;
	await flushPendingRename();
	if (isBusy.value) return;
	if (!window.confirm(`确定删除“${bookmark.title}”吗？`)) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		await deleteTradeBookmark(bookmark.id);
	} catch (error) {
		statusText.value = "删除书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签删除失败", error);
	} finally {
		isBusy.value = false;
	}
}

function onFolderDragStart(event: DragEvent, folder: TradeBookmarkFolder): void {
	if (pendingRenamePromise) {
		event.preventDefault();
		void flushPendingRename();
		return;
	}

	if (isBusy.value || !folder.canModify || renamingFolderId.value === folder.id || isInteractiveDragSource(event)) {
		event.preventDefault();
		return;
	}

	dragItem.value = { type: BookmarkDragItemType.Folder, id: folder.id };
	prepareDragEvent(event);
}

function onBookmarkDragStart(event: DragEvent, bookmark: TradeBookmarkItem): void {
	if (pendingRenamePromise) {
		event.preventDefault();
		void flushPendingRename();
		return;
	}

	if (isBusy.value || renamingBookmarkId.value === bookmark.id || isInteractiveDragSource(event)) {
		event.preventDefault();
		return;
	}

	dragItem.value = { type: BookmarkDragItemType.Bookmark, id: bookmark.id };
	prepareDragEvent(event);
}

function onFolderDragOver(event: DragEvent, folder: TradeBookmarkFolder | TradeBookmarkRoot): void {
	const target = getFolderDropTarget(event, folder);
	if (!target) {
		dropTarget.value = null;
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	dropTarget.value = target;
	if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function onBookmarkDragOver(event: DragEvent, bookmark: TradeBookmarkItem): void {
	const target = getBookmarkDropTarget(event, bookmark);
	if (!target) {
		dropTarget.value = null;
		return;
	}

	event.preventDefault();
	event.stopPropagation();
	dropTarget.value = target;
	if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

async function onDrop(event: DragEvent): Promise<void> {
	event.preventDefault();
	event.stopPropagation();
	await flushPendingRename();

	const item = dragItem.value;
	const target = dropTarget.value;
	if (!item || !target || isBusy.value) {
		clearDragState();
		return;
	}

	isBusy.value = true;
	statusText.value = "";

	try {
		if (item.type === BookmarkDragItemType.Folder) {
			const moveTarget = getFolderMoveTarget(item.id, target);
			if (!moveTarget) return;

			await moveBookmarkFolder(item.id, moveTarget.parentId, moveTarget.index);
			if (target.type === BookmarkDragItemType.Folder && target.position === BookmarkDropPosition.Inside)
				expandFolder(target.id);
		} else {
			const moveTarget = getBookmarkMoveTarget(item.id, target);
			if (!moveTarget) return;

			await moveTradeBookmark(item.id, moveTarget.folderId, moveTarget.index);
			expandFolder(moveTarget.folderId);
		}
	} catch (error) {
		statusText.value = error instanceof Error ? error.message : "移动失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签拖拽移动失败", error);
	} finally {
		isBusy.value = false;
		clearDragState();
	}
}

function onPanelDragOver(event: DragEvent): void {
	if (!dragItem.value) return;
	event.preventDefault();
}

function onPanelDrop(event: DragEvent): void {
	event.preventDefault();
	clearDragState();
}

function getFolderDropClass(folder: TradeBookmarkFolder | TradeBookmarkRoot): Record<string, boolean> {
	return {
		"dragging-source":
			dragItem.value?.type === BookmarkDragItemType.Folder && dragItem.value.id === getFolderDropId(folder),
		"drop-before": isFolderDropTarget(folder, BookmarkDropPosition.Before),
		"drop-inside": isFolderDropTarget(folder, BookmarkDropPosition.Inside),
		"drop-after": isFolderDropTarget(folder, BookmarkDropPosition.After),
	};
}

function getBookmarkDropClass(bookmark: TradeBookmarkItem): Record<string, boolean> {
	return {
		"dragging-source": dragItem.value?.type === BookmarkDragItemType.Bookmark && dragItem.value.id === bookmark.id,
		"drop-before": isBookmarkDropTarget(bookmark, BookmarkDropPosition.Before),
		"drop-after": isBookmarkDropTarget(bookmark, BookmarkDropPosition.After),
	};
}

function getFolderDropTarget(event: DragEvent, folder: TradeBookmarkFolder | TradeBookmarkRoot): DropTarget | null {
	const item = dragItem.value;
	if (!item) return null;

	if (item.type === BookmarkDragItemType.Bookmark) {
		if (isRootFolder(folder)) return null;
		return {
			type: BookmarkDragItemType.Folder,
			id: getFolderDropId(folder),
			position: BookmarkDropPosition.Inside,
		};
	}

	if (!isRootFolder(folder) && item.id === folder.id) return null;
	if (isRootFolder(folder))
		return {
			type: BookmarkDragItemType.Folder,
			id: getFolderDropId(folder),
			position: BookmarkDropPosition.Inside,
		};
	return { type: BookmarkDragItemType.Folder, id: folder.id, position: getHalfDropPosition(event) };
}

function getBookmarkDropTarget(event: DragEvent, bookmark: TradeBookmarkItem): DropTarget | null {
	const item = dragItem.value;
	if (!item || item.type !== BookmarkDragItemType.Bookmark || item.id === bookmark.id || !bookmark.parentId)
		return null;

	return {
		type: BookmarkDragItemType.Bookmark,
		id: bookmark.id,
		folderId: bookmark.parentId,
		position: getHalfDropPosition(event),
	};
}

function getFolderMoveTarget(folderId: string, target: DropTarget): { parentId: string; index: number } | null {
	if (target.type === BookmarkDragItemType.Bookmark || !bookmarkTree.value) return null;
	const folders = bookmarkTree.value.folders;

	if (target.position === BookmarkDropPosition.Inside) {
		if (target.id !== rootFolderId) return null;
		return { parentId: rootFolderId, index: folders.length };
	}

	const targetIndex = folders.findIndex((folder) => folder.id === target.id);
	if (targetIndex < 0) return null;

	const index = target.position === BookmarkDropPosition.After ? targetIndex + 1 : targetIndex;
	const currentIndex = folders.findIndex((folder) => folder.id === folderId);
	if (currentIndex === index || currentIndex + 1 === index) return null;

	return {
		parentId: rootFolderId,
		index,
	};
}

function getBookmarkMoveTarget(bookmarkId: string, target: DropTarget): { folderId: string; index: number } | null {
	if (!bookmarkTree.value) return null;

	if (target.type === BookmarkDragItemType.Folder) {
		const folder = findFolderInTree(target.id);
		if (!folder?.parentId) return null;
		return {
			folderId: folder.id,
			index: folder.bookmarks.length,
		};
	}

	const folder = findFolderInTree(target.folderId);
	if (!folder) return null;
	const targetIndex = folder.bookmarks.findIndex((bookmark) => bookmark.id === target.id);
	if (targetIndex < 0) return null;

	const index = target.position === BookmarkDropPosition.After ? targetIndex + 1 : targetIndex;
	const currentIndex = folder.bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId);
	if (currentIndex === index || currentIndex + 1 === index) return null;

	return {
		folderId: folder.id,
		index,
	};
}

function queueFolderRename(): Promise<void> | null {
	const folderId = renamingFolderId.value;
	if (!folderId) return pendingRenamePromise;

	const title = renamingFolderTitle.value;
	creatingFolderId.value = "";
	clearFolderRename();
	updateFolderTitleInTree(folderId, getFolderRenameTitle(title));

	return queueRename(async () => {
		try {
			await renameBookmarkFolder(folderId, title);
		} catch (error) {
			statusText.value = "重命名文件夹失败，请稍后重试。";
			console.error("[poe2-extensions] trade 书签目录重命名失败", error);
			await loadBookmarks();
		}
	});
}

function queueBookmarkRename(): Promise<void> | null {
	const bookmarkId = renamingBookmarkId.value;
	if (!bookmarkId) return pendingRenamePromise;

	const title = renamingBookmarkTitle.value;
	creatingBookmarkId.value = "";
	clearBookmarkRename();
	updateBookmarkTitleInTree(bookmarkId, getBookmarkRenameTitle(bookmarkId, title));

	return queueRename(async () => {
		try {
			await renameTradeBookmark(bookmarkId, title);
		} catch (error) {
			statusText.value = "重命名书签失败，请稍后重试。";
			console.error("[poe2-extensions] trade 书签重命名失败", error);
			await loadBookmarks();
		}
	});
}

function queueRename(action: () => Promise<void>): Promise<void> {
	const pendingRename = (pendingRenamePromise ?? Promise.resolve()).then(action).finally(() => {
		if (pendingRenamePromise === pendingRename) pendingRenamePromise = null;
	});

	pendingRenamePromise = pendingRename;
	return pendingRename;
}

async function flushPendingRename(): Promise<void> {
	const pendingRename = pendingRenamePromise;
	if (pendingRename) await pendingRename;
}

function updateFolderTitleInTree(folderId: string, title: string): void {
	const folder = findFolderInTree(folderId);
	if (folder) folder.title = title;
}

function updateBookmarkTitleInTree(bookmarkId: string, title: string): void {
	const bookmark = findBookmarkInTree(bookmarkId);
	if (bookmark) bookmark.title = title;
}

function getFolderRenameTitle(title: string): string {
	return title.trim() || "New Folder";
}

function getBookmarkRenameTitle(bookmarkId: string, title: string): string {
	const trimmedTitle = title.trim();
	if (trimmedTitle) return trimmedTitle;

	const bookmark = findBookmarkInTree(bookmarkId);
	return bookmark ? getTradeBookmarkTitle(undefined, bookmark.url) : "Trade 搜索";
}

function getTradeBookmarkTitle(title: string | undefined, url: string): string {
	const trimmedTitle = title?.trim();
	if (trimmedTitle) return trimmedTitle;

	try {
		const parsedUrl = new URL(url);
		const queryId = parsedUrl.pathname.split("/").filter(Boolean).pop();
		return queryId ? `Trade 搜索 ${queryId}` : "Trade 搜索";
	} catch {
		return "Trade 搜索";
	}
}

function clearFolderRename(): void {
	renamingFolderId.value = "";
	renamingFolderTitle.value = "";
}

function clearBookmarkRename(): void {
	renamingBookmarkId.value = "";
	renamingBookmarkTitle.value = "";
}

function removeExpandedFolder(folderId: string): void {
	const nextExpandedIds = new Set(expandedFolderIds.value);
	nextExpandedIds.delete(folderId);
	expandedFolderIds.value = nextExpandedIds;
}

function expandFolder(folderId: string): void {
	const nextExpandedIds = new Set(expandedFolderIds.value);
	nextExpandedIds.add(folderId);
	expandedFolderIds.value = nextExpandedIds;
}

function findFolderInTree(folderId: string): TradeBookmarkFolder | null {
	return bookmarkTree.value?.folders.find((folder) => folder.id === folderId) ?? null;
}

function findBookmarkInTree(bookmarkId: string): TradeBookmarkItem | null {
	for (const folder of bookmarkTree.value?.folders ?? []) {
		const bookmark = folder.bookmarks.find((item) => item.id === bookmarkId);
		if (bookmark) return bookmark;
	}

	return null;
}

function isRootFolder(folder: TradeBookmarkFolder | TradeBookmarkRoot): folder is TradeBookmarkRoot {
	return "folders" in folder;
}

function getFolderDropId(folder: TradeBookmarkFolder | TradeBookmarkRoot): string {
	return isRootFolder(folder) ? rootFolderId : folder.id;
}
function getHalfDropPosition(event: DragEvent): BookmarkDropPosition.Before | BookmarkDropPosition.After {
	const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	if (!element) return BookmarkDropPosition.After;

	const rect = element.getBoundingClientRect();
	return event.clientY - rect.top < rect.height / 2 ? BookmarkDropPosition.Before : BookmarkDropPosition.After;
}

function isFolderDropTarget(folder: TradeBookmarkFolder | TradeBookmarkRoot, position: BookmarkDropPosition): boolean {
	const target = dropTarget.value;
	return (
		target?.type === BookmarkDragItemType.Folder
		&& target.id === getFolderDropId(folder)
		&& target.position === position
	);
}

function isBookmarkDropTarget(
	bookmark: TradeBookmarkItem,
	position: BookmarkDropPosition.Before | BookmarkDropPosition.After,
): boolean {
	const target = dropTarget.value;
	return target?.type === BookmarkDragItemType.Bookmark && target.id === bookmark.id && target.position === position;
}

function isInteractiveDragSource(event: DragEvent): boolean {
	const target = event.target;
	return target instanceof HTMLElement && Boolean(target.closest("button, input, textarea, select, .sidepanel-menu"));
}

function prepareDragEvent(event: DragEvent): void {
	if (!event.dataTransfer) return;

	event.dataTransfer.effectAllowed = "move";
	event.dataTransfer.setData("text/plain", "poe2-trade-bookmark");
}

function clearDragState(): void {
	dragItem.value = null;
	dropTarget.value = null;
}
</script>

<template>
	<section class="tab-content">
		<input
			ref="importFileInput"
			class="bookmark-import-input"
			type="file"
			accept="application/json,.json"
			@change="onImportBookmarksChange" />
		<section class="bookmark-list" @click="closeMenu">
			<BookmarkTreeHeader
				v-if="rootBookmarkFolder"
				:folder="rootBookmarkFolder"
				:busy="isBusy"
				:drop-class="getFolderDropClass(rootBookmarkFolder)"
				:on-create-folder="() => onCreateFolder(rootFolderId)"
				:on-open-menu="(event) => rootBookmarkFolder && openRootFolderMenu(event, rootBookmarkFolder)"
				:on-context-menu="(event) => rootBookmarkFolder && openRootFolderContextMenu(event, rootBookmarkFolder)"
				:on-drag-over="(event) => rootBookmarkFolder && onFolderDragOver(event, rootBookmarkFolder)"
				:on-drop="onDrop"
				:on-drag-end="clearDragState" />

			<div class="bookmark-tree-viewport">
				<div v-if="isLoadingBookmarks" class="panel muted">读取书签中</div>
				<div v-else-if="!bookmarkTree" class="panel muted">这个目录下还没有可用的书签目录。</div>

				<section v-else class="panel bookmark-tree" @dragover="onPanelDragOver" @drop="onPanelDrop">
					<div v-for="folder in visibleBookmarkFolders" :key="folder.id" class="bookmark-folder">
						<div
							class="bookmark-folder-group"
							:class="{ expanded: hasFolderContent(folder) && isFolderExpanded(folder) }">
							<BookmarkFolder
								v-model:rename-title="renamingFolderTitle"
								:folder="folder"
								:expanded="isFolderExpanded(folder)"
								:has-content="hasFolderContent(folder)"
								:busy="isBusy"
								:renaming="renamingFolderId === folder.id"
								:drop-class="getFolderDropClass(folder)"
								:on-toggle-expanded="() => toggleFolderExpanded(folder)"
								:on-add-bookmark="() => addCurrentSearchToFolder(folder.id)"
								:on-start-rename="() => startRenameFolder(folder)"
								:on-open-menu="(event) => openFolderMenu(event, folder)"
								:on-context-menu="(event) => openFolderContextMenu(event, folder)"
								:on-drag-start="(event) => onFolderDragStart(event, folder)"
								:on-drag-over="(event) => onFolderDragOver(event, folder)"
								:on-drop="onDrop"
								:on-drag-end="clearDragState"
								:on-confirm-rename="confirmRenameFolder"
								:on-cancel-rename="cancelFolderRename"
								:on-rename-blur="onFolderRenameBlur" />

							<div v-show="isFolderExpanded(folder)" class="bookmark-folder-body">
								<BookmarkItem
									v-for="bookmark in folder.bookmarks"
									:key="bookmark.id"
									v-model:rename-title="renamingBookmarkTitle"
									:bookmark="bookmark"
									:busy="isBusy"
									:renaming="renamingBookmarkId === bookmark.id"
									:drop-class="getBookmarkDropClass(bookmark)"
									:on-open="() => onOpenBookmark(bookmark)"
									:on-start-rename="() => startRenameBookmark(bookmark)"
									:on-open-menu="(event) => openBookmarkItemMenu(event, bookmark)"
									:on-context-menu="(event) => openBookmarkContextMenu(event, bookmark)"
									:on-drag-start="(event) => onBookmarkDragStart(event, bookmark)"
									:on-drag-over="(event) => onBookmarkDragOver(event, bookmark)"
									:on-drop="onDrop"
									:on-drag-end="clearDragState"
									:on-confirm-rename="confirmRenameBookmark"
									:on-cancel-rename="cancelBookmarkRename"
									:on-rename-blur="onBookmarkRenameBlur" />
							</div>
						</div>
					</div>
				</section>
			</div>
			<p class="message" :class="{ empty: !statusText }" aria-live="polite">{{ statusText }}</p>
		</section>
	</section>
</template>

<style scoped>
.tab-content {
	display: grid;
	grid-template-rows: minmax(0, 1fr);
	gap: 0;
	min-height: 0;
	padding: 8px;
	background: #000;
}

.panel {
	padding: 4px;
	border: 0;
	border-radius: 0;
	background: #000;
}

p {
	margin: 0;
}

.message,
.muted {
	color: var(--color-text);
}

.message {
	padding: 7px 9px;
	border: 1px solid #8a6d3b;
	background: #101112;
	font-size: 11px;
	line-height: 1.4;
}

.message.empty {
	visibility: hidden;
}

.bookmark-list {
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	gap: 4px;
	min-height: 0;
}

.bookmark-import-input {
	display: none;
}

.bookmark-tree-viewport {
	min-height: 0;
	overflow: auto;
}

.bookmark-tree {
	display: grid;
	align-content: start;
	gap: 1px;
	padding: 0;
}

.bookmark-folder {
	display: grid;
	gap: 0;
}

.bookmark-folder-group {
	position: relative;
	width: 100%;
	margin-bottom: 3px;
}

.bookmark-folder-group.expanded {
	margin-bottom: 3px;
}

.bookmark-folder-body {
	width: 100%;
	box-sizing: border-box;
	padding: 0 0 0 42px;
}
</style>
