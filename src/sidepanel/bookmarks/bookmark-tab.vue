<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
	addCurrentTradeSearchBookmark,
	createBookmarkFolder,
	deleteBookmarkFolder,
	deleteTradeBookmark,
	getTradeBookmarkRootTree,
	moveBookmarkFolder,
	moveTradeBookmark,
	openTradeBookmark,
	renameBookmarkFolder,
	renameTradeBookmark,
	replaceTradeBookmarkWithCurrentSearch,
} from "../../bookmarks/bookmarks-bookmarks";
import type { TradeBookmarkItem, TradeBookmarkTreeNode } from "../../bookmarks/bookmarks-types";
import BookmarkFolder from "./bookmark-folder.vue";
import BookmarkItem from "./bookmark-item.vue";

type VisibleBookmarkFolder = TradeBookmarkTreeNode & {
	displayDepth: number;
};

type OpenMenu =
	| { type: "folder"; id: string; x?: number; y?: number }
	| { type: "bookmark"; id: string; x?: number; y?: number };

type DragItem = { type: "folder"; id: string } | { type: "bookmark"; id: string };

type DropTarget =
	| { type: "folder"; id: string; position: "before" | "inside" | "after" }
	| { type: "bookmark"; id: string; folderId: string; position: "before" | "after" };

const emit = defineEmits<{
	initialized: [success: boolean];
}>();

const props = defineProps<{
	active: boolean;
}>();

const bookmarkTree = ref<TradeBookmarkTreeNode | null>(null);
const isLoadingBookmarks = ref(true);
const expandedFolderIds = ref<Set<string>>(new Set());
const openMenu = ref<OpenMenu | null>(null);
const renamingFolderId = ref("");
const renamingFolderTitle = ref("");
const renamingBookmarkId = ref("");
const renamingBookmarkTitle = ref("");
const creatingFolderId = ref("");
const creatingBookmarkId = ref("");
const statusText = ref("");
const isBusy = ref(false);
const skipNextFolderRenameBlur = ref(false);
const skipNextBookmarkRenameBlur = ref(false);
const dragItem = ref<DragItem | null>(null);
const dropTarget = ref<DropTarget | null>(null);

const visibleBookmarkFolders = computed<VisibleBookmarkFolder[]>(() =>
	bookmarkTree.value ? flattenVisibleBookmarkFolders([bookmarkTree.value]) : [],
);

watch(
	bookmarkTree,
	(tree) => {
		const previousExpandedIds = expandedFolderIds.value;
		const nextFolderIds = new Set(tree ? getAllFolderIds(tree) : []);
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
	document.addEventListener("click", closeMoreMenuOnOutsidePointer);
	document.addEventListener("contextmenu", closeMoreMenuOnOutsidePointer);
	void loadBookmarks();
});

onBeforeUnmount(() => {
	document.removeEventListener("click", closeMoreMenuOnOutsidePointer);
	document.removeEventListener("contextmenu", closeMoreMenuOnOutsidePointer);
});

async function loadBookmarks(): Promise<void> {
	isLoadingBookmarks.value = true;

	try {
		bookmarkTree.value = await getTradeBookmarkRootTree();
		emit("initialized", true);
	} catch (error) {
		bookmarkTree.value = null;
		statusText.value = "本地书签读取失败，请稍后重试。";
		emit("initialized", false);
		console.error("[poe2-extensions] trade 书签读取失败", error);
	} finally {
		isLoadingBookmarks.value = false;
	}
}

function isFolderExpanded(folder: VisibleBookmarkFolder): boolean {
	return folder.displayDepth === 0 || expandedFolderIds.value.has(folder.id);
}

function hasFolderContent(folder: VisibleBookmarkFolder): boolean {
	return folder.children.length > 0 || folder.bookmarks.length > 0;
}

function toggleFolderExpanded(folder: VisibleBookmarkFolder): void {
	if (folder.displayDepth === 0 || !hasFolderContent(folder)) return;

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
	closeMoreMenu();
	expandedFolderIds.value = new Set();
}

function collapseOtherFolders(folder: VisibleBookmarkFolder): void {
	statusText.value = "";
	closeMoreMenu();

	const nextExpandedIds = new Set<string>();
	let currentFolder: TradeBookmarkTreeNode | null = folder;

	while (currentFolder?.parentId) {
		nextExpandedIds.add(currentFolder.id);
		currentFolder = bookmarkTree.value ? findFolderInTree(bookmarkTree.value, currentFolder.parentId) : null;
	}

	expandedFolderIds.value = nextExpandedIds;
}

function onFolderDoubleClick(folder: VisibleBookmarkFolder): void {
	if (folder.displayDepth === 0 || renamingFolderId.value === folder.id || !hasFolderContent(folder)) return;
	toggleFolderExpanded(folder);
}

function toggleMoreMenu(menu: OpenMenu): void {
	statusText.value = "";
	if (openMenu.value?.type === menu.type && openMenu.value.id === menu.id && menu.x === undefined) {
		openMenu.value = null;
		return;
	}

	openMenu.value = menu;
}

function closeMoreMenu(): void {
	openMenu.value = null;
}

function closeMoreMenuOnOutsidePointer(event: MouseEvent): void {
	if (!openMenu.value) return;

	const target = event.target;
	if (target instanceof HTMLElement && target.closest(".more-menu")) return;

	closeMoreMenu();
}

function openContextMenu(event: MouseEvent, menu: OpenMenu): void {
	if (isBusy.value) return;

	event.preventDefault();
	event.stopPropagation();
	statusText.value = "";
	openMenu.value = {
		...menu,
		x: event.clientX,
		y: event.clientY,
	};
}

function getMoreMenuStyle(menu: OpenMenu): Record<string, string> | undefined {
	if (menu.x === undefined || menu.y === undefined) return undefined;

	return {
		position: "fixed",
		left: `${menu.x}px`,
		top: `${menu.y}px`,
		right: "auto",
	};
}

function isMenuOpen(type: OpenMenu["type"], id: string): boolean {
	return openMenu.value?.type === type && openMenu.value.id === id;
}

async function addCurrentSearchToFolder(folderId: string): Promise<void> {
	if (isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";
	closeMoreMenu();

	try {
		const bookmark = await addCurrentTradeSearchBookmark(folderId);
		expandFolder(folderId);
		creatingBookmarkId.value = bookmark.id;
		renamingBookmarkId.value = bookmark.id;
		renamingBookmarkTitle.value = bookmark.title;
		await loadBookmarks();
	} catch (error) {
		statusText.value = error instanceof Error ? error.message : "添加书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 搜索书签添加失败", error);
	} finally {
		isBusy.value = false;
	}
}

async function onCreateFolder(parentId: string): Promise<void> {
	if (isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";
	closeMoreMenu();

	try {
		const folder = await createBookmarkFolder(parentId, "New Folder");
		expandFolder(parentId);
		creatingFolderId.value = folder.id;
		renamingFolderId.value = folder.id;
		renamingFolderTitle.value = folder.title;
		await loadBookmarks();
	} catch (error) {
		statusText.value = "新建文件夹失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签目录创建失败", error);
	} finally {
		isBusy.value = false;
	}
}

function startRenameFolder(folder: TradeBookmarkTreeNode): void {
	if (!folder.canModify) return;
	closeMoreMenu();
	void cancelBookmarkRename();
	renamingFolderId.value = folder.id;
	renamingFolderTitle.value = folder.title;
}

async function confirmRenameFolder(): Promise<void> {
	const folderId = renamingFolderId.value;
	if (!folderId || isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		await renameBookmarkFolder(folderId, renamingFolderTitle.value);
		creatingFolderId.value = "";
		clearFolderRename();
		await loadBookmarks();
	} catch (error) {
		statusText.value = "重命名文件夹失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签目录重命名失败", error);
	} finally {
		isBusy.value = false;
	}
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
		await loadBookmarks();
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

	void confirmRenameFolder();
}

async function onDeleteFolder(folder: TradeBookmarkTreeNode): Promise<void> {
	if (!folder.canModify || isBusy.value) return;
	if (!window.confirm(`确定删除“${folder.title}”及其所有内容吗？`)) return;

	isBusy.value = true;
	statusText.value = "";
	closeMoreMenu();

	try {
		await deleteBookmarkFolder(folder.id);
		removeExpandedFolder(folder.id);
		await loadBookmarks();
	} catch (error) {
		statusText.value = "删除文件夹失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签目录删除失败", error);
	} finally {
		isBusy.value = false;
	}
}

function startRenameBookmark(bookmark: TradeBookmarkItem): void {
	closeMoreMenu();
	void cancelFolderRename();
	renamingBookmarkId.value = bookmark.id;
	renamingBookmarkTitle.value = bookmark.title;
}

async function confirmRenameBookmark(): Promise<void> {
	const bookmarkId = renamingBookmarkId.value;
	if (!bookmarkId || isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";

	try {
		await renameTradeBookmark(bookmarkId, renamingBookmarkTitle.value);
		creatingBookmarkId.value = "";
		clearBookmarkRename();
		await loadBookmarks();
	} catch (error) {
		statusText.value = "重命名书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签重命名失败", error);
	} finally {
		isBusy.value = false;
	}
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
		await loadBookmarks();
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

	void confirmRenameBookmark();
}

async function onOpenBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	try {
		await openTradeBookmark(bookmark.url);
	} catch (error) {
		statusText.value = "打开书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签打开失败", error);
	}
}

async function onReplaceBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	if (isBusy.value) return;

	isBusy.value = true;
	statusText.value = "";
	closeMoreMenu();

	try {
		await replaceTradeBookmarkWithCurrentSearch(bookmark.id);
		statusText.value = "书签链接已替换为当前搜索。";
		await loadBookmarks();
	} catch (error) {
		statusText.value = error instanceof Error ? error.message : "替换书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签替换失败", error);
	} finally {
		isBusy.value = false;
	}
}

async function onDeleteBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	if (isBusy.value) return;
	if (!window.confirm(`确定删除“${bookmark.title}”吗？`)) return;

	isBusy.value = true;
	statusText.value = "";
	closeMoreMenu();

	try {
		await deleteTradeBookmark(bookmark.id);
		await loadBookmarks();
	} catch (error) {
		statusText.value = "删除书签失败，请稍后重试。";
		console.error("[poe2-extensions] trade 书签删除失败", error);
	} finally {
		isBusy.value = false;
	}
}

function onFolderDragStart(event: DragEvent, folder: VisibleBookmarkFolder): void {
	if (isBusy.value || !folder.canModify || renamingFolderId.value === folder.id || isInteractiveDragSource(event)) {
		event.preventDefault();
		return;
	}

	dragItem.value = { type: "folder", id: folder.id };
	prepareDragEvent(event);
	closeMoreMenu();
}

function onBookmarkDragStart(event: DragEvent, bookmark: TradeBookmarkItem): void {
	if (isBusy.value || renamingBookmarkId.value === bookmark.id || isInteractiveDragSource(event)) {
		event.preventDefault();
		return;
	}

	dragItem.value = { type: "bookmark", id: bookmark.id };
	prepareDragEvent(event);
	closeMoreMenu();
}

function onFolderDragOver(event: DragEvent, folder: VisibleBookmarkFolder): void {
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

	const item = dragItem.value;
	const target = dropTarget.value;
	if (!item || !target || isBusy.value) {
		clearDragState();
		return;
	}

	isBusy.value = true;
	statusText.value = "";

	try {
		if (item.type === "folder") {
			const moveTarget = getFolderMoveTarget(item.id, target);
			if (!moveTarget) return;

			await moveBookmarkFolder(item.id, moveTarget.parentId, moveTarget.index);
			if (target.type === "folder" && target.position === "inside") expandFolder(target.id);
		} else {
			const moveTarget = getBookmarkMoveTarget(item.id, target);
			if (!moveTarget) return;

			await moveTradeBookmark(item.id, moveTarget.folderId, moveTarget.index);
			expandFolder(moveTarget.folderId);
		}

		await loadBookmarks();
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

function getFolderDropClass(folder: VisibleBookmarkFolder): Record<string, boolean> {
	return {
		"dragging-source": dragItem.value?.type === "folder" && dragItem.value.id === folder.id,
		"drop-before": isFolderDropTarget(folder, "before"),
		"drop-inside": isFolderDropTarget(folder, "inside"),
		"drop-after": isFolderDropTarget(folder, "after"),
	};
}

function getBookmarkDropClass(bookmark: TradeBookmarkItem): Record<string, boolean> {
	return {
		"dragging-source": dragItem.value?.type === "bookmark" && dragItem.value.id === bookmark.id,
		"drop-before": isBookmarkDropTarget(bookmark, "before"),
		"drop-after": isBookmarkDropTarget(bookmark, "after"),
	};
}

function getFolderDropTarget(event: DragEvent, folder: VisibleBookmarkFolder): DropTarget | null {
	const item = dragItem.value;
	if (!item) return null;

	if (item.type === "bookmark") {
		if (folder.displayDepth === 0) return null;
		return { type: "folder", id: folder.id, position: "inside" };
	}

	if (item.id === folder.id || isFolderDescendant(item.id, folder.id)) return null;

	if (folder.displayDepth === 0) {
		return { type: "folder", id: folder.id, position: "inside" };
	}

	return { type: "folder", id: folder.id, position: getHalfDropPosition(event) };
}

function getBookmarkDropTarget(event: DragEvent, bookmark: TradeBookmarkItem): DropTarget | null {
	const item = dragItem.value;
	if (!item || item.type !== "bookmark" || item.id === bookmark.id || !bookmark.parentId) return null;

	return {
		type: "bookmark",
		id: bookmark.id,
		folderId: bookmark.parentId,
		position: getHalfDropPosition(event),
	};
}

function getFolderMoveTarget(folderId: string, target: DropTarget): { parentId: string; index: number } | null {
	if (target.type === "bookmark" || !bookmarkTree.value) return null;

	if (target.position === "inside") {
		const targetFolder = findFolderInTree(bookmarkTree.value, target.id);
		if (!targetFolder || targetFolder.parentId) return null;
		return {
			parentId: targetFolder.id,
			index: targetFolder.children.length,
		};
	}

	const targetFolder = findFolderInTree(bookmarkTree.value, target.id);
	if (!targetFolder?.parentId) return null;
	const parent = findFolderInTree(bookmarkTree.value, targetFolder.parentId);
	if (!parent) return null;

	const targetIndex = parent.children.findIndex((folder) => folder.id === target.id);
	if (targetIndex < 0) return null;

	const index = target.position === "after" ? targetIndex + 1 : targetIndex;
	const currentIndex = parent.children.findIndex((folder) => folder.id === folderId);
	if (currentIndex === index || currentIndex + 1 === index) return null;

	return {
		parentId: parent.id,
		index,
	};
}

function getBookmarkMoveTarget(bookmarkId: string, target: DropTarget): { folderId: string; index: number } | null {
	if (!bookmarkTree.value) return null;

	if (target.type === "folder") {
		const folder = findFolderInTree(bookmarkTree.value, target.id);
		if (!folder?.parentId) return null;
		return {
			folderId: folder.id,
			index: folder.bookmarks.length,
		};
	}

	const folder = findFolderInTree(bookmarkTree.value, target.folderId);
	if (!folder) return null;
	const targetIndex = folder.bookmarks.findIndex((bookmark) => bookmark.id === target.id);
	if (targetIndex < 0) return null;

	const index = target.position === "after" ? targetIndex + 1 : targetIndex;
	const currentIndex = folder.bookmarks.findIndex((bookmark) => bookmark.id === bookmarkId);
	if (currentIndex === index || currentIndex + 1 === index) return null;

	return {
		folderId: folder.id,
		index,
	};
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

function flattenVisibleBookmarkFolders(nodes: TradeBookmarkTreeNode[], depth = 0): VisibleBookmarkFolder[] {
	const visibleFolders: VisibleBookmarkFolder[] = [];

	for (const node of nodes) {
		visibleFolders.push({
			...node,
			displayDepth: depth,
		});

		if (depth === 0 || expandedFolderIds.value.has(node.id)) {
			visibleFolders.push(...flattenVisibleBookmarkFolders(node.children, depth + 1));
		}
	}

	return visibleFolders;
}

function getAllFolderIds(node: TradeBookmarkTreeNode): string[] {
	return [node.id, ...node.children.flatMap(getAllFolderIds)];
}

function findFolderInTree(node: TradeBookmarkTreeNode, folderId: string): TradeBookmarkTreeNode | null {
	if (node.id === folderId) return node;

	for (const child of node.children) {
		const match = findFolderInTree(child, folderId);
		if (match) return match;
	}

	return null;
}

function isFolderDescendant(parentFolderId: string, possibleDescendantId: string): boolean {
	const parent = bookmarkTree.value ? findFolderInTree(bookmarkTree.value, parentFolderId) : null;
	return Boolean(parent && parent.id !== possibleDescendantId && findFolderInTree(parent, possibleDescendantId));
}

function getHalfDropPosition(event: DragEvent): "before" | "after" {
	const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
	if (!element) return "after";

	const rect = element.getBoundingClientRect();
	return event.clientY - rect.top < rect.height / 2 ? "before" : "after";
}

function isFolderDropTarget(folder: VisibleBookmarkFolder, position: "before" | "inside" | "after"): boolean {
	const target = dropTarget.value;
	return target?.type === "folder" && target.id === folder.id && target.position === position;
}

function isBookmarkDropTarget(bookmark: TradeBookmarkItem, position: "before" | "after"): boolean {
	const target = dropTarget.value;
	return target?.type === "bookmark" && target.id === bookmark.id && target.position === position;
}

function isInteractiveDragSource(event: DragEvent): boolean {
	const target = event.target;
	return target instanceof HTMLElement && Boolean(target.closest("button, input, textarea, select, .more-menu"));
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
		<section class="bookmark-list" aria-live="polite" @click="closeMoreMenu">
			<p v-if="statusText" class="message">{{ statusText }}</p>
			<div v-if="isLoadingBookmarks" class="panel muted">读取书签中</div>
			<div v-else-if="!bookmarkTree" class="panel muted">这个目录下还没有可用的书签目录。</div>

			<section v-else class="panel bookmark-tree" @dragover="onPanelDragOver" @drop="onPanelDrop">
				<div
					v-for="folder in visibleBookmarkFolders"
					:key="folder.id"
					class="bookmark-folder"
					:style="{ marginLeft: `${Math.max(0, folder.displayDepth - 1) * 8}px` }">
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
							:menu-open="isMenuOpen('folder', folder.id)"
							:menu-style="
								isMenuOpen('folder', folder.id) && openMenu ? getMoreMenuStyle(openMenu) : undefined
							"
							@toggle-expanded="toggleFolderExpanded(folder)"
							@folder-double-click="onFolderDoubleClick(folder)"
							@add-bookmark="addCurrentSearchToFolder(folder.id)"
							@create-folder="onCreateFolder(folder.id)"
							@start-rename="startRenameFolder(folder)"
							@delete-folder="onDeleteFolder(folder)"
							@collapse-others="collapseOtherFolders(folder)"
							@collapse-all="collapseAllFolders"
							@toggle-menu="toggleMoreMenu({ type: 'folder', id: folder.id })"
							@context-menu="openContextMenu($event, { type: 'folder', id: folder.id })"
							@drag-start="onFolderDragStart($event, folder)"
							@drag-over="onFolderDragOver($event, folder)"
							@drop="onDrop"
							@drag-end="clearDragState"
							@confirm-rename="confirmRenameFolder"
							@cancel-rename="cancelFolderRename"
							@rename-blur="onFolderRenameBlur" />

						<div v-show="isFolderExpanded(folder)" class="bookmark-folder-body">
							<BookmarkItem
								v-for="bookmark in folder.bookmarks"
								:key="bookmark.id"
								v-model:rename-title="renamingBookmarkTitle"
								:bookmark="bookmark"
								:busy="isBusy"
								:renaming="renamingBookmarkId === bookmark.id"
								:drop-class="getBookmarkDropClass(bookmark)"
								:menu-open="isMenuOpen('bookmark', bookmark.id)"
								:menu-style="
									isMenuOpen('bookmark', bookmark.id) && openMenu
										? getMoreMenuStyle(openMenu)
										: undefined
								"
								@open="onOpenBookmark(bookmark)"
								@start-rename="startRenameBookmark(bookmark)"
								@replace="onReplaceBookmark(bookmark)"
								@delete="onDeleteBookmark(bookmark)"
								@toggle-menu="toggleMoreMenu({ type: 'bookmark', id: bookmark.id })"
								@context-menu="openContextMenu($event, { type: 'bookmark', id: bookmark.id })"
								@drag-start="onBookmarkDragStart($event, bookmark)"
								@drag-over="onBookmarkDragOver($event, bookmark)"
								@drop="onDrop"
								@drag-end="clearDragState"
								@confirm-rename="confirmRenameBookmark"
								@cancel-rename="cancelBookmarkRename"
								@rename-blur="onBookmarkRenameBlur" />
						</div>
					</div>
				</div>
			</section>
		</section>
	</section>
</template>

<style scoped>
.tab-content {
	display: grid;
	gap: 0;
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

.bookmark-list {
	display: grid;
	gap: 4px;
}

.bookmark-tree {
	display: grid;
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
	padding: 0 0 0 39px;
}
</style>
