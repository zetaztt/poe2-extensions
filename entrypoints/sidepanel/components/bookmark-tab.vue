<script lang="ts" setup>
import { computed, ref, watch, type Directive } from 'vue';
import {
	addCurrentTradeSearchBookmark,
	createBookmarkFolder,
	deleteBookmarkFolder,
	deleteTradeBookmark,
	renameBookmarkFolder,
	renameTradeBookmark,
	replaceTradeBookmarkWithCurrentSearch,
	type BookmarkFolderOption,
	type TradeBookmarkGroup,
	type TradeBookmarkItem,
	type TradeBookmarkTreeNode,
} from '@/src/trade/bookmarks';

type VisibleBookmarkFolder = TradeBookmarkTreeNode & {
	displayDepth: number;
};

type OpenMenu =
	| { type: 'folder'; id: string }
	| { type: 'bookmark'; id: string };

const props = defineProps<{
	selectedFolder: BookmarkFolderOption;
	bookmarkTree: TradeBookmarkTreeNode | null;
	bookmarkGroups: TradeBookmarkGroup[];
	bookmarkCount: number;
	isLoadingBookmarks: boolean;
	isSavingBookmark: boolean;
	bookmarkStatusText: string;
}>();

const emit = defineEmits<{
	refresh: [];
	'add-current-search': [folderId?: string];
	'open-bookmark': [url: string];
}>();

const expandedFolderIds = ref<Set<string>>(new Set());
const openMenu = ref<OpenMenu | null>(null);
const renamingFolderId = ref('');
const renamingFolderTitle = ref('');
const renamingBookmarkId = ref('');
const renamingBookmarkTitle = ref('');
const creatingFolderId = ref('');
const creatingBookmarkId = ref('');
const localStatusText = ref('');
const isLocalBusy = ref(false);
const skipNextFolderRenameBlur = ref(false);
const skipNextBookmarkRenameBlur = ref(false);

const vFocus: Directive<HTMLInputElement> = {
	mounted(element) {
		element.focus();
		element.select();
	},
};

const isBusy = computed(() => props.isSavingBookmark || isLocalBusy.value);

const statusText = computed(() => props.bookmarkStatusText || localStatusText.value);

const visibleBookmarkFolders = computed<VisibleBookmarkFolder[]>(() => (
	props.bookmarkTree ? flattenVisibleBookmarkFolders([props.bookmarkTree]) : []
));

watch(() => props.bookmarkTree, (tree) => {
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
}, { immediate: true });

function getFolderIndent(depth: number): string {
	return `${Math.max(0, depth - 1) * 12}px`;
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

function onFolderDoubleClick(folder: VisibleBookmarkFolder): void {
	if (folder.displayDepth === 0 || renamingFolderId.value === folder.id || !hasFolderContent(folder)) return;
	toggleFolderExpanded(folder);
}

function toggleMoreMenu(menu: OpenMenu): void {
	localStatusText.value = '';
	if (openMenu.value?.type === menu.type && openMenu.value.id === menu.id) {
		openMenu.value = null;
		return;
	}

	openMenu.value = menu;
}

function closeMoreMenu(): void {
	openMenu.value = null;
}

async function addCurrentSearchToFolder(folderId: string): Promise<void> {
	if (isBusy.value) return;

	isLocalBusy.value = true;
	localStatusText.value = '';
	closeMoreMenu();

	try {
		const bookmark = await addCurrentTradeSearchBookmark(folderId);
		const nextExpandedIds = new Set(expandedFolderIds.value);
		nextExpandedIds.add(folderId);
		expandedFolderIds.value = nextExpandedIds;
		creatingBookmarkId.value = bookmark.id;
		renamingBookmarkId.value = bookmark.id;
		renamingBookmarkTitle.value = bookmark.title;
		emit('refresh');
	} catch (error) {
		localStatusText.value = error instanceof Error ? error.message : '添加书签失败，请稍后重试。';
		console.error('[poe2-extensions] trade 搜索书签添加失败', error);
	} finally {
		isLocalBusy.value = false;
	}
}

async function onCreateFolder(parentId: string): Promise<void> {
	if (isBusy.value) return;

	isLocalBusy.value = true;
	localStatusText.value = '';
	closeMoreMenu();

	try {
		const folder = await createBookmarkFolder(parentId, 'New Folder');
		const nextExpandedIds = new Set(expandedFolderIds.value);
		nextExpandedIds.add(parentId);
		expandedFolderIds.value = nextExpandedIds;
		creatingFolderId.value = folder.id;
		renamingFolderId.value = folder.id;
		renamingFolderTitle.value = folder.title;
		emit('refresh');
	} catch (error) {
		localStatusText.value = '新建文件夹失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录创建失败', error);
	} finally {
		isLocalBusy.value = false;
	}
}

function startRenameFolder(folder: TradeBookmarkTreeNode): void {
	if (!folder.canModify) return;
	closeMoreMenu();
	cancelBookmarkRename();
	renamingFolderId.value = folder.id;
	renamingFolderTitle.value = folder.title;
}

async function confirmRenameFolder(): Promise<void> {
	const folderId = renamingFolderId.value;
	if (!folderId || isBusy.value) return;

	isLocalBusy.value = true;
	localStatusText.value = '';

	try {
		await renameBookmarkFolder(folderId, renamingFolderTitle.value);
		creatingFolderId.value = '';
		clearFolderRename();
		emit('refresh');
	} catch (error) {
		localStatusText.value = '重命名文件夹失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录重命名失败', error);
	} finally {
		isLocalBusy.value = false;
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
	isLocalBusy.value = true;
	localStatusText.value = '';

	try {
		await deleteBookmarkFolder(folderId);
		creatingFolderId.value = '';
		clearFolderRename();
		emit('refresh');
	} catch (error) {
		localStatusText.value = '取消新建文件夹失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录取消创建失败', error);
	} finally {
		isLocalBusy.value = false;
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

	isLocalBusy.value = true;
	localStatusText.value = '';
	closeMoreMenu();

	try {
		await deleteBookmarkFolder(folder.id);
		removeExpandedFolder(folder.id);
		emit('refresh');
	} catch (error) {
		localStatusText.value = '删除文件夹失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录删除失败', error);
	} finally {
		isLocalBusy.value = false;
	}
}

function startRenameBookmark(bookmark: TradeBookmarkItem): void {
	closeMoreMenu();
	cancelFolderRename();
	renamingBookmarkId.value = bookmark.id;
	renamingBookmarkTitle.value = bookmark.title;
}

async function confirmRenameBookmark(): Promise<void> {
	const bookmarkId = renamingBookmarkId.value;
	if (!bookmarkId || isBusy.value) return;

	isLocalBusy.value = true;
	localStatusText.value = '';

	try {
		await renameTradeBookmark(bookmarkId, renamingBookmarkTitle.value);
		creatingBookmarkId.value = '';
		cancelBookmarkRename();
		emit('refresh');
	} catch (error) {
		localStatusText.value = '重命名书签失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签重命名失败', error);
	} finally {
		isLocalBusy.value = false;
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
	isLocalBusy.value = true;
	localStatusText.value = '';

	try {
		await deleteTradeBookmark(bookmarkId);
		creatingBookmarkId.value = '';
		clearBookmarkRename();
		emit('refresh');
	} catch (error) {
		localStatusText.value = '取消新建书签失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签取消创建失败', error);
	} finally {
		isLocalBusy.value = false;
	}
}

function onBookmarkRenameBlur(): void {
	if (skipNextBookmarkRenameBlur.value) {
		skipNextBookmarkRenameBlur.value = false;
		return;
	}

	void confirmRenameBookmark();
}

function clearBookmarkRename(): void {
	renamingBookmarkId.value = '';
	renamingBookmarkTitle.value = '';
}

async function onReplaceBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	if (isBusy.value) return;

	isLocalBusy.value = true;
	localStatusText.value = '';
	closeMoreMenu();

	try {
		await replaceTradeBookmarkWithCurrentSearch(bookmark.id);
		localStatusText.value = '书签链接已替换为当前搜索。';
		emit('refresh');
	} catch (error) {
		localStatusText.value = error instanceof Error ? error.message : '替换书签失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签替换失败', error);
	} finally {
		isLocalBusy.value = false;
	}
}

async function onDeleteBookmark(bookmark: TradeBookmarkItem): Promise<void> {
	if (isBusy.value) return;
	if (!window.confirm(`确定删除“${bookmark.title}”吗？`)) return;

	isLocalBusy.value = true;
	localStatusText.value = '';
	closeMoreMenu();

	try {
		await deleteTradeBookmark(bookmark.id);
		emit('refresh');
	} catch (error) {
		localStatusText.value = '删除书签失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签删除失败', error);
	} finally {
		isLocalBusy.value = false;
	}
}

function clearFolderRename(): void {
	renamingFolderId.value = '';
	renamingFolderTitle.value = '';
}

function removeExpandedFolder(folderId: string): void {
	const nextExpandedIds = new Set(expandedFolderIds.value);
	nextExpandedIds.delete(folderId);
	expandedFolderIds.value = nextExpandedIds;
}

function flattenVisibleBookmarkFolders(nodes: TradeBookmarkTreeNode[], depth = 0): VisibleBookmarkFolder[] {
	const visibleFolders: VisibleBookmarkFolder[] = [];

	for (const node of nodes) {
		const visibleNode = {
			...node,
			displayDepth: depth,
		};
		visibleFolders.push(visibleNode);

		if (depth === 0 || expandedFolderIds.value.has(node.id)) {
			visibleFolders.push(...flattenVisibleBookmarkFolders(node.children, depth + 1));
		}
	}

	return visibleFolders;
}

function getAllFolderIds(node: TradeBookmarkTreeNode): string[] {
	return [
		node.id,
		...node.children.flatMap(getAllFolderIds),
	];
}
</script>

<template>
	<section class="tab-content">
		<section class="bookmark-list" aria-live="polite" @click="closeMoreMenu">
			<p v-if="statusText" class="message">{{ statusText }}</p>
			<div v-if="isLoadingBookmarks" class="panel muted">读取书签中</div>
			<div v-else-if="!bookmarkTree" class="panel muted">这个目录下还没有可用的书签目录。</div>

			<section
				v-else
				class="panel bookmark-tree"
			>
				<div
					v-for="folder in visibleBookmarkFolders"
					:key="folder.id"
					class="bookmark-folder"
				>
					<div
						class="folder-row"
						:class="{ 'top-level': folder.displayDepth === 0 }"
						:style="{ paddingLeft: getFolderIndent(folder.displayDepth) }"
					>
						<button
							v-if="folder.displayDepth > 0"
							class="tree-toggle"
							type="button"
							:disabled="!hasFolderContent(folder)"
							:title="isFolderExpanded(folder) ? '折叠' : '展开'"
							@click.stop="toggleFolderExpanded(folder)"
						>
							{{ hasFolderContent(folder) ? (isFolderExpanded(folder) ? '▾' : '▸') : '' }}
						</button>
						<span v-if="folder.displayDepth > 0" class="folder-icon" aria-hidden="true"></span>
						<input
							v-if="renamingFolderId === folder.id"
							v-model="renamingFolderTitle"
							v-focus
							class="rename-input"
							type="text"
							:disabled="isBusy"
							@click.stop
							@dblclick.stop
							@keydown.enter.prevent="confirmRenameFolder"
							@keydown.esc.prevent="cancelFolderRename"
							@blur="onFolderRenameBlur"
						>
						<span
							v-else
							class="folder-title"
							@dblclick.stop="onFolderDoubleClick(folder)"
						>
							{{ folder.title }}
						</span>
						<span class="folder-count">{{ folder.bookmarks.length }}</span>
						<button
							v-if="folder.displayDepth === 0"
							class="row-action"
							type="button"
							:disabled="isLoadingBookmarks"
							title="刷新书签"
							@click.stop="emit('refresh')"
						>
							刷新
						</button>
						<button
							class="row-action"
							type="button"
							:disabled="isBusy"
							title="添加当前搜索到此文件夹"
							@click.stop="addCurrentSearchToFolder(folder.id)"
						>
							添加书签
						</button>
						<button
							v-if="folder.displayDepth === 0"
							class="row-action"
							type="button"
							:disabled="isBusy"
							title="添加子文件夹"
							@click.stop="onCreateFolder(folder.id)"
						>
							添加文件夹
						</button>
						<button
							v-if="folder.displayDepth > 0 && folder.canModify"
							class="row-action"
							type="button"
							:disabled="isBusy"
							title="重命名文件夹"
							@click.stop="startRenameFolder(folder)"
						>
							重命名
						</button>
						<div v-if="folder.displayDepth > 0" class="more-wrap">
							<button
								class="more-button"
								type="button"
								:disabled="isBusy"
								title="更多"
								@click.stop="toggleMoreMenu({ type: 'folder', id: folder.id })"
							>
								⋯
							</button>
							<div
								v-if="openMenu?.type === 'folder' && openMenu.id === folder.id"
								class="more-menu"
								@click.stop
							>
								<button type="button" @click="onCreateFolder(folder.id)">添加文件夹</button>
								<button
									type="button"
									:disabled="!folder.canModify"
									@click="onDeleteFolder(folder)"
								>
									删除
								</button>
							</div>
						</div>
					</div>

					<div
						v-for="bookmark in folder.bookmarks"
						v-show="isFolderExpanded(folder)"
						:key="bookmark.id"
						class="bookmark-item"
						:style="{ marginLeft: getFolderIndent(folder.displayDepth) }"
					>
						<button
							v-if="renamingBookmarkId !== bookmark.id"
							class="bookmark-open"
							type="button"
							:title="bookmark.url"
							@click="emit('open-bookmark', bookmark.url)"
						>
							<span class="bookmark-title">{{ bookmark.title }}</span>
						</button>
						<div v-else class="bookmark-rename">
							<input
								v-model="renamingBookmarkTitle"
								v-focus
								class="rename-input"
								type="text"
								:disabled="isBusy"
								@keydown.enter.prevent="confirmRenameBookmark"
								@keydown.esc.prevent="cancelBookmarkRename"
								@blur="onBookmarkRenameBlur"
							>
						</div>
						<button
							class="row-action"
							type="button"
							:disabled="isBusy"
							title="重命名书签"
							@click.stop="startRenameBookmark(bookmark)"
						>
							重命名
						</button>
						<div class="more-wrap">
							<button
								class="more-button"
								type="button"
								:disabled="isBusy"
								title="更多"
								@click.stop="toggleMoreMenu({ type: 'bookmark', id: bookmark.id })"
							>
								⋯
							</button>
							<div
								v-if="openMenu?.type === 'bookmark' && openMenu.id === bookmark.id"
								class="more-menu"
								@click.stop
							>
								<button type="button" @click="onReplaceBookmark(bookmark)">用当前搜索替换</button>
								<button type="button" @click="onDeleteBookmark(bookmark)">删除</button>
							</div>
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
	gap: 12px;
}

.panel {
	padding: 14px;
	border: 1px solid #3b3024;
	border-radius: 8px;
	background: #211a13;
}

p {
	margin: 0;
}

.message,
.muted {
	color: #c9bba7;
}

.row-action,
.more-button {
	color: inherit;
	font: inherit;
	cursor: pointer;
}

.row-action:disabled,
.more-button:disabled {
	opacity: 0.6;
	cursor: default;
}

.message {
	margin-top: 10px;
	font-size: 13px;
	line-height: 1.5;
}

.bookmark-list {
	display: grid;
	gap: 12px;
}

.bookmark-tree {
	display: grid;
	gap: 6px;
	padding: 8px;
}

.bookmark-folder {
	display: grid;
	gap: 6px;
}

.folder-row {
	display: grid;
	grid-template-columns: 14px 16px minmax(0, 1fr) auto auto auto auto;
	align-items: center;
	min-height: 32px;
	gap: 7px;
	border-radius: 6px;
	padding-right: 6px;
	color: #f4efe4;
}

.folder-row.top-level {
	grid-template-columns: minmax(0, 1fr) auto auto auto auto;
}

.folder-row:hover {
	background: #33271c;
}

.tree-toggle,
.more-button {
	border: 0;
	padding: 0;
	color: #c9bba7;
	background: transparent;
	font: inherit;
}

.tree-toggle {
	width: 14px;
	height: 26px;
	cursor: pointer;
}

.tree-toggle:disabled {
	cursor: default;
}

.folder-icon {
	position: relative;
	width: 15px;
	height: 11px;
	border-radius: 2px;
	background: #d7a85f;
}

.folder-icon::before {
	position: absolute;
	top: -3px;
	left: 1px;
	width: 7px;
	height: 4px;
	border-radius: 2px 2px 0 0;
	background: #d7a85f;
	content: '';
}

.folder-title {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 700;
}

.folder-count {
	color: #c9bba7;
	font-size: 12px;
}

.row-action {
	min-height: 26px;
	border: 1px solid #5c4c3a;
	border-radius: 5px;
	padding: 0 7px;
	background: #33271c;
	color: #f4efe4;
	font-size: 12px;
	white-space: nowrap;
}

.row-action:hover {
	border-color: #d7a85f;
}

.more-wrap {
	position: relative;
}

.more-button {
	width: 26px;
	height: 26px;
	border-radius: 5px;
	font-size: 18px;
	line-height: 1;
}

.more-button:hover {
	background: #33271c;
	color: #f4efe4;
}

.more-menu {
	position: absolute;
	top: 30px;
	right: 0;
	z-index: 5;
	min-width: 132px;
	padding: 4px;
	border: 1px solid #5c4c3a;
	border-radius: 6px;
	background: #18130e;
	box-shadow: 0 10px 24px rgb(0 0 0 / 0.4);
}

.more-menu button {
	display: block;
	width: 100%;
	min-height: 30px;
	border: 0;
	border-radius: 4px;
	padding: 0 10px;
	color: #f4efe4;
	text-align: left;
	background: transparent;
	cursor: pointer;
	white-space: nowrap;
}

.more-menu button:hover:not(:disabled) {
	background: #33271c;
}

.more-menu button:disabled {
	opacity: 0.55;
	cursor: default;
}

.bookmark-item {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	align-items: center;
	min-height: 30px;
	margin-top: 2px;
	border: 0;
	border-radius: 6px;
	background: transparent;
}

.bookmark-item:hover {
	background: #33271c;
}

.bookmark-open {
	min-width: 0;
	border: 0;
	padding: 5px 8px;
	color: inherit;
	text-align: left;
	background: transparent;
	font: inherit;
	cursor: pointer;
}

.bookmark-title {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.bookmark-title {
	font-weight: 700;
}

.bookmark-rename {
	min-width: 0;
	padding: 2px 8px;
}

.rename-input {
	min-width: 0;
	width: 100%;
	height: 26px;
	border: 1px solid #d7a85f;
	border-radius: 4px;
	padding: 0 6px;
	color: #f4efe4;
	background: #15110c;
	font: inherit;
}
</style>
