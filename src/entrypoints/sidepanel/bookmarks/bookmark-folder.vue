<script lang="ts" setup>
import type { Directive } from 'vue';
import type { TradeBookmarkTreeNode } from '@/bookmarks/types';
import BookmarkMenu from './bookmark-menu.vue';

const props = defineProps<{
	folder: TradeBookmarkTreeNode & { displayDepth: number };
	expanded: boolean;
	hasContent: boolean;
	busy: boolean;
	renaming: boolean;
	dropClass: Record<string, boolean>;
	menuOpen: boolean;
	menuStyle?: Record<string, string>;
}>();

const renameTitle = defineModel<string>('renameTitle', { required: true });

const emit = defineEmits<{
	'toggle-expanded': [];
	'folder-double-click': [];
	'add-bookmark': [];
	'create-folder': [];
	'start-rename': [];
	'delete-folder': [];
	'toggle-menu': [];
	'context-menu': [event: MouseEvent];
	'drag-start': [event: DragEvent];
	'drag-over': [event: DragEvent];
	drop: [event: DragEvent];
	'drag-end': [];
	'confirm-rename': [];
	'cancel-rename': [];
	'rename-blur': [];
}>();

const vFocus: Directive<HTMLInputElement> = {
	mounted(element) {
		element.focus();
		element.select();
	},
};

function onMenuAction(actionId: string): void {
	if (actionId === 'create') {
		emit('create-folder');
		return;
	}

	emit('delete-folder');
}
</script>

<template>
	<div
		class="folder-row"
		:class="[
			{ 'top-level': folder.displayDepth === 0 },
			dropClass,
		]"
		:style="{ paddingLeft: `${Math.max(0, folder.displayDepth) * 8}px` }"
		:draggable="folder.canModify && !renaming && !busy"
		@dragstart="emit('drag-start', $event)"
		@dragover="emit('drag-over', $event)"
		@drop="emit('drop', $event)"
		@dragend="emit('drag-end')"
		@contextmenu="emit('context-menu', $event)"
	>
		<button
			v-if="folder.displayDepth > 0"
			class="tree-toggle"
			type="button"
			:disabled="!hasContent"
			:title="expanded ? '折叠' : '展开'"
			@click.stop="emit('toggle-expanded')"
		>
			{{ hasContent ? (expanded ? '▾' : '▸') : '' }}
		</button>
		<span v-if="folder.displayDepth > 0" class="folder-icon" aria-hidden="true"></span>
		<input
			v-if="renaming"
			v-model="renameTitle"
			v-focus
			class="rename-input"
			type="text"
			:disabled="busy"
			@click.stop
			@dblclick.stop
			@keydown.enter.prevent="emit('confirm-rename')"
			@keydown.esc.prevent="emit('cancel-rename')"
			@blur="emit('rename-blur')"
		>
		<span
			v-else
			class="folder-title"
			@dblclick.stop="emit('folder-double-click')"
		>
			{{ folder.title }}
		</span>
		<span class="folder-count">{{ folder.bookmarks.length }}</span>
		<button
			class="row-action"
			type="button"
			:disabled="busy"
			title="添加当前搜索到此文件夹"
			@click.stop="emit('add-bookmark')"
		>
			添加书签
		</button>
		<button
			v-if="folder.displayDepth === 0"
			class="row-action"
			type="button"
			:disabled="busy"
			title="添加子文件夹"
			@click.stop="emit('create-folder')"
		>
			添加文件夹
		</button>
		<button
			v-if="folder.displayDepth > 0 && folder.canModify"
			class="row-action"
			type="button"
			:disabled="busy"
			title="重命名文件夹"
			@click.stop="emit('start-rename')"
		>
			重命名
		</button>
		<BookmarkMenu
			v-if="folder.displayDepth > 0"
			:open="menuOpen"
			:disabled="busy"
			:menu-style="menuStyle"
			:actions="[
				{ id: 'create', label: '添加文件夹' },
				{ id: 'delete', label: '删除', disabled: !folder.canModify },
			]"
			@toggle="emit('toggle-menu')"
			@select="onMenuAction"
		/>
	</div>
</template>

<style scoped>
.folder-row {
	position: relative;
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
	grid-template-columns: minmax(0, 1fr) auto auto auto;
}

.folder-row:hover {
	background: #33271c;
}

.folder-row[draggable='true'] {
	cursor: grab;
}

.folder-row.dragging-source {
	opacity: 0.48;
}

.folder-row.drop-inside {
	outline: 1px solid #d7a85f;
	background: #3d2f20;
}

.folder-row.drop-before,
.folder-row.drop-after {
	box-shadow: inset 0 2px 0 #d7a85f;
}

.folder-row.drop-after {
	box-shadow: inset 0 -2px 0 #d7a85f;
}

.tree-toggle {
	width: 14px;
	height: 26px;
	border: 0;
	padding: 0;
	color: #c9bba7;
	background: transparent;
	font: inherit;
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
	font: inherit;
	font-size: 12px;
	white-space: nowrap;
	cursor: pointer;
}

.row-action:hover {
	border-color: #d7a85f;
}

.row-action:disabled {
	opacity: 0.6;
	cursor: default;
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
