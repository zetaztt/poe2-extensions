<script lang="ts" setup>
import { computed, ref, watch, type Directive } from 'vue';
import {
	createBookmarkFolder,
	deleteBookmarkFolder,
	getBookmarkFolderOptions,
	getBookmarkFolderTree,
	renameBookmarkFolder,
	type BookmarkFolderOption,
	type BookmarkFolderTreeNode,
} from '@/src/trade/bookmarks';

type FolderContextMenu = {
	folderId: string;
	x: number;
	y: number;
};

type VisibleFolderNode = BookmarkFolderTreeNode & {
	displayDepth: number;
};

const props = defineProps<{
	open: boolean;
	selectedFolder: BookmarkFolderOption | null;
}>();

const emit = defineEmits<{
	close: [];
	selected: [folderId: string];
}>();

const folderOptions = ref<BookmarkFolderOption[]>([]);
const folderTree = ref<BookmarkFolderTreeNode[]>([]);
const expandedFolderIds = ref<Set<string>>(new Set());
const draftSelectedFolderId = ref('');
const statusText = ref('');
const isBusy = ref(false);
const folderContextMenu = ref<FolderContextMenu | null>(null);
const renamingFolderId = ref('');
const renamingFolderTitle = ref('');
const creatingFolderId = ref('');
const skipNextRenameBlur = ref(false);

const vFocus: Directive<HTMLInputElement> = {
	mounted(element) {
		element.focus();
		element.select();
	},
};

const visibleFolderNodes = computed<VisibleFolderNode[]>(() => flattenVisibleFolderNodes(folderTree.value));

const draftSelectedFolder = computed(() => (
	folderOptions.value.find((folder) => folder.id === draftSelectedFolderId.value) ?? null
));

watch(() => props.open, (open) => {
	if (open) void openDialog();
});

async function openDialog(): Promise<void> {
	statusText.value = '';
	folderContextMenu.value = null;
	cancelRenameFolder();
	await refreshFolderDialogTree(props.selectedFolder?.id);
}

function closeDialog(): void {
	folderContextMenu.value = null;
	statusText.value = '';
	cancelRenameFolder();
	emit('close');
}

function confirmFolderSelection(): void {
	if (!draftSelectedFolderId.value) {
		statusText.value = '请选择一个书签目录。';
		return;
	}

	emit('selected', draftSelectedFolderId.value);
}

async function onCreateFolder(): Promise<void> {
	if (!draftSelectedFolderId.value) {
		statusText.value = '请选择新文件夹的父目录。';
		return;
	}

	isBusy.value = true;
	statusText.value = '';

	try {
		const folder = await createBookmarkFolder(draftSelectedFolderId.value, 'New Folder');
		await refreshFolderDialogTree(folder.id);
		creatingFolderId.value = folder.id;
		renamingFolderId.value = folder.id;
		renamingFolderTitle.value = folder.title;
	} catch (error) {
		statusText.value = '新建文件夹失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录创建失败', error);
	} finally {
		isBusy.value = false;
	}
}

async function onRenameFolder(): Promise<void> {
	const folder = draftSelectedFolder.value;
	if (!folder?.canModify) return;

	folderContextMenu.value = null;
	renamingFolderId.value = folder.id;
	renamingFolderTitle.value = folder.title;
}

async function confirmRenameFolder(): Promise<void> {
	const folderId = renamingFolderId.value;
	if (!folderId || isBusy.value) return;

	isBusy.value = true;
	statusText.value = '';

	try {
		const renamedFolder = await renameBookmarkFolder(folderId, renamingFolderTitle.value);
		creatingFolderId.value = '';
		cancelRenameFolder();
		await refreshFolderDialogTree(renamedFolder.id);
		statusText.value = `已重命名为：${renamedFolder.title}`;
	} catch (error) {
		statusText.value = '重命名失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录重命名失败', error);
	} finally {
		isBusy.value = false;
	}
}

async function cancelRenameFolder(): Promise<void> {
	const folderId = renamingFolderId.value;
	if (folderId && folderId === creatingFolderId.value) {
		await cancelCreateFolder(folderId);
		return;
	}

	clearRenameState();
}

async function cancelCreateFolder(folderId: string): Promise<void> {
	const fallbackFolderId = draftSelectedFolder.value?.parentId ?? getFirstFolderId(folderTree.value);
	skipNextRenameBlur.value = true;
	isBusy.value = true;
	statusText.value = '';

	try {
		await deleteBookmarkFolder(folderId);
		creatingFolderId.value = '';
		clearRenameState();
		await refreshFolderDialogTree(fallbackFolderId);
	} catch (error) {
		statusText.value = '取消新建文件夹失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录取消创建失败', error);
	} finally {
		isBusy.value = false;
	}
}

function clearRenameState(): void {
	renamingFolderId.value = '';
	renamingFolderTitle.value = '';
}

function onRenameBlur(): void {
	if (skipNextRenameBlur.value) {
		skipNextRenameBlur.value = false;
		return;
	}

	void confirmRenameFolder();
}

async function onDeleteFolder(): Promise<void> {
	const folder = draftSelectedFolder.value;
	if (!folder?.canModify) return;
	if (!window.confirm(`确定删除“${folder.title}”及其所有内容吗？`)) return;

	isBusy.value = true;
	statusText.value = '';
	folderContextMenu.value = null;

	try {
		const fallbackFolderId = folder.parentId ?? getFirstFolderId(folderTree.value);
		await deleteBookmarkFolder(folder.id);
		await refreshFolderDialogTree(fallbackFolderId);
		statusText.value = '目录已删除。';
	} catch (error) {
		statusText.value = '删除失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录删除失败', error);
	} finally {
		isBusy.value = false;
	}
}

async function refreshFolderDialogTree(preferredFolderId: string | undefined): Promise<void> {
	isBusy.value = true;

	try {
		const [tree, options] = await Promise.all([
			getBookmarkFolderTree(),
			getBookmarkFolderOptions(),
		]);

		folderTree.value = tree;
		folderOptions.value = options;

		const nextSelectedId = preferredFolderId && options.some((folder) => folder.id === preferredFolderId)
			? preferredFolderId
			: props.selectedFolder?.id && options.some((folder) => folder.id === props.selectedFolder?.id)
				? props.selectedFolder.id
				: getFirstFolderId(tree);

		draftSelectedFolderId.value = nextSelectedId ?? '';
		expandedFolderIds.value = new Set(nextSelectedId ? getAncestorFolderIds(tree, nextSelectedId) : []);
	} catch (error) {
		statusText.value = '目录树读取失败，请稍后重试。';
		console.error('[poe2-extensions] trade 书签目录树读取失败', error);
	} finally {
		isBusy.value = false;
	}
}

function selectDraftFolder(folderId: string): void {
	draftSelectedFolderId.value = folderId;
	folderContextMenu.value = null;
}

function onFolderDoubleClick(folder: BookmarkFolderTreeNode): void {
	if (renamingFolderId.value === folder.id || folder.children.length === 0) return;
	toggleFolderExpanded(folder.id);
}

function toggleFolderExpanded(folderId: string): void {
	const nextExpandedIds = new Set(expandedFolderIds.value);
	if (nextExpandedIds.has(folderId)) {
		nextExpandedIds.delete(folderId);
	} else {
		nextExpandedIds.add(folderId);
	}

	expandedFolderIds.value = nextExpandedIds;
}

function openFolderContextMenu(event: MouseEvent, folder: BookmarkFolderTreeNode): void {
	if (!folder.canModify) return;

	event.preventDefault();
	draftSelectedFolderId.value = folder.id;
	folderContextMenu.value = {
		folderId: folder.id,
		x: event.clientX,
		y: event.clientY,
	};
}

function closeFolderContextMenu(): void {
	folderContextMenu.value = null;
}

function flattenVisibleFolderNodes(nodes: BookmarkFolderTreeNode[], depth = 0): VisibleFolderNode[] {
	const visibleNodes: VisibleFolderNode[] = [];

	for (const node of nodes) {
		visibleNodes.push({
			...node,
			displayDepth: depth,
		});

		if (expandedFolderIds.value.has(node.id)) {
			visibleNodes.push(...flattenVisibleFolderNodes(node.children, depth + 1));
		}
	}

	return visibleNodes;
}

function getFirstFolderId(nodes: BookmarkFolderTreeNode[]): string | undefined {
	for (const node of nodes) return node.id;
	return undefined;
}

function getAncestorFolderIds(nodes: BookmarkFolderTreeNode[], targetFolderId: string): string[] {
	for (const node of nodes) {
		if (node.id === targetFolderId) return [];

		const childPath = getAncestorFolderIds(node.children, targetFolderId);
		if (childPath.length > 0 || node.children.some((child) => child.id === targetFolderId)) {
			return [node.id, ...childPath];
		}
	}

	return [];
}

function formatPath(path: string[] | undefined): string {
	return path?.length ? path.join(' / ') : '未选择';
}
</script>

<template>
	<div
		v-if="open"
		class="modal-backdrop"
		@click.self="closeDialog"
		@contextmenu.prevent
	>
		<section class="folder-dialog" role="dialog" aria-modal="true" aria-labelledby="folder-dialog-title">
			<header class="dialog-header">
				<div>
					<h2 id="folder-dialog-title">选择书签目录</h2>
					<p class="setting-description">{{ draftSelectedFolder ? formatPath(draftSelectedFolder.path) : '请选择目录' }}</p>
				</div>
				<button
					class="icon-button"
					type="button"
					title="关闭"
					:disabled="isBusy"
					@click="closeDialog"
				>
					×
				</button>
			</header>

			<div class="folder-tree" @click="closeFolderContextMenu">
				<div v-if="isBusy && folderTree.length === 0" class="tree-empty">读取目录中</div>
				<div v-else-if="visibleFolderNodes.length === 0" class="tree-empty">没有可用的书签目录。</div>
				<div
					v-for="folder in visibleFolderNodes"
					v-else
					:key="folder.id"
					class="tree-row"
					:class="{ selected: draftSelectedFolderId === folder.id }"
					:style="{ paddingLeft: `${folder.displayDepth * 18 + 8}px` }"
					@contextmenu="openFolderContextMenu($event, folder)"
				>
					<button
						class="tree-toggle"
						type="button"
						:disabled="folder.children.length === 0"
						:title="expandedFolderIds.has(folder.id) ? '折叠' : '展开'"
						@click.stop="toggleFolderExpanded(folder.id)"
					>
						{{ folder.children.length ? (expandedFolderIds.has(folder.id) ? '▾' : '▸') : '' }}
					</button>
					<div
						v-if="renamingFolderId === folder.id"
						class="tree-rename"
						@click.stop
						@contextmenu.stop
					>
						<span class="folder-icon" aria-hidden="true"></span>
							<input
								v-model="renamingFolderTitle"
								v-focus
								class="rename-input"
								type="text"
								:disabled="isBusy"
								@keydown.enter.prevent="confirmRenameFolder"
								@keydown.esc.prevent="cancelRenameFolder"
								@blur="onRenameBlur"
							>
						</div>
					<button
						v-else
						class="tree-label"
						type="button"
						@click.stop="selectDraftFolder(folder.id)"
						@dblclick.stop="onFolderDoubleClick(folder)"
					>
						<span class="folder-icon" aria-hidden="true"></span>
						<span>{{ folder.title }}</span>
					</button>
				</div>
			</div>

			<div
				v-if="folderContextMenu"
				class="context-menu"
				:style="{ left: `${folderContextMenu.x}px`, top: `${folderContextMenu.y}px` }"
			>
				<button type="button" @click="onRenameFolder">重命名</button>
				<button type="button" @click="onDeleteFolder">删除</button>
			</div>

			<p v-if="statusText" class="message">{{ statusText }}</p>

			<footer class="dialog-footer">
				<button
					class="secondary-button"
					type="button"
					:disabled="isBusy || !draftSelectedFolderId"
					@click="onCreateFolder"
				>
					新建文件夹
				</button>
				<span class="dialog-footer-spacer"></span>
				<button
					class="secondary-button"
					type="button"
					:disabled="isBusy"
					@click="closeDialog"
				>
					取消
				</button>
				<button
					class="primary-button"
					type="button"
					:disabled="isBusy || !draftSelectedFolderId"
					@click="confirmFolderSelection"
				>
					选择
				</button>
			</footer>
		</section>
	</div>
</template>

<style scoped>
.modal-backdrop {
	position: fixed;
	inset: 0;
	z-index: 20;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 16px;
	background: rgb(0 0 0 / 0.58);
}

.folder-dialog {
	width: min(100%, 420px);
	max-height: calc(100vh - 32px);
	display: grid;
	grid-template-rows: auto minmax(180px, 1fr) auto auto;
	border: 1px solid #5c4c3a;
	border-radius: 8px;
	background: #211a13;
	box-shadow: 0 16px 40px rgb(0 0 0 / 0.4);
	color: #f4efe4;
}

.dialog-header,
.dialog-footer {
	display: flex;
	align-items: center;
	gap: 10px;
	padding: 12px;
}

.dialog-header {
	justify-content: space-between;
	border-bottom: 1px solid #3b3024;
}

.dialog-footer {
	justify-content: flex-start;
	border-top: 1px solid #3b3024;
}

.dialog-footer-spacer {
	flex: 1 1 auto;
}

h2,
p {
	margin: 0;
}

h2 {
	font-size: 16px;
}

.setting-description,
.message {
	color: #c9bba7;
}

.setting-description {
	display: block;
	margin-top: 6px;
	font-size: 13px;
	line-height: 1.5;
}

.folder-tree {
	position: relative;
	min-height: 180px;
	max-height: 360px;
	overflow: auto;
	padding: 8px 0;
}

.tree-empty {
	padding: 14px;
	color: #c9bba7;
	font-size: 13px;
}

.tree-row {
	display: grid;
	grid-template-columns: 22px 1fr;
	align-items: center;
	min-height: 30px;
	padding-right: 8px;
}

.tree-row:hover,
.tree-row.selected {
	background: #33271c;
}

.tree-toggle,
.tree-label {
	border: 0;
	color: inherit;
	background: transparent;
	font: inherit;
	cursor: pointer;
}

.tree-toggle {
	width: 22px;
	height: 26px;
	padding: 0;
	color: #c9bba7;
}

.tree-toggle:disabled {
	cursor: default;
}

.tree-label,
.tree-rename {
	display: flex;
	align-items: center;
	gap: 7px;
	min-width: 0;
	height: 30px;
	padding: 0 4px;
	text-align: left;
}

.tree-label span:last-child {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.folder-icon {
	position: relative;
	flex: 0 0 auto;
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

.rename-input {
	min-width: 0;
	border: 1px solid #5c4c3a;
	color: #f4efe4;
	background: #15110c;
	font: inherit;
}

.rename-input {
	flex: 1 1 auto;
	height: 24px;
	border-color: #d7a85f;
	border-radius: 4px;
	padding: 0 6px;
}

.primary-button,
.secondary-button,
.icon-button {
	border: 1px solid #d7a85f;
	border-radius: 6px;
	background: #6f5124;
	color: #f4efe4;
	font: inherit;
	cursor: pointer;
}

.primary-button {
	min-height: 36px;
	padding: 0 12px;
	font-weight: 700;
}

.secondary-button {
	min-height: 34px;
	padding: 0 10px;
	border-color: #5c4c3a;
	background: #33271c;
}

.icon-button {
	width: 32px;
	height: 32px;
	font-size: 18px;
	line-height: 1;
}

.primary-button:disabled,
.secondary-button:disabled,
.icon-button:disabled {
	opacity: 0.6;
	cursor: default;
}

.context-menu {
	position: fixed;
	z-index: 30;
	min-width: 112px;
	padding: 4px;
	border: 1px solid #5c4c3a;
	border-radius: 6px;
	background: #18130e;
	box-shadow: 0 10px 24px rgb(0 0 0 / 0.4);
}

.context-menu button {
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
}

.context-menu button:hover {
	background: #33271c;
}

.message {
	margin: 10px 12px 0;
	font-size: 13px;
	line-height: 1.5;
}
</style>
