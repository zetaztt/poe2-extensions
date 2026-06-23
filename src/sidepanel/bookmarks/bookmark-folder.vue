<script lang="ts" setup>
import type { Directive } from "vue";
import type { TradeBookmarkTreeNode } from "../../bookmarks/bookmarks-types";
import BookmarkMenu from "./bookmark-menu.vue";

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

const renameTitle = defineModel<string>("renameTitle", { required: true });

const emit = defineEmits<{
	"toggle-expanded": [];
	"folder-double-click": [];
	"add-bookmark": [];
	"create-folder": [];
	"start-rename": [];
	"delete-folder": [];
	"collapse-others": [];
	"collapse-all": [];
	"toggle-menu": [];
	"context-menu": [event: MouseEvent];
	"drag-start": [event: DragEvent];
	"drag-over": [event: DragEvent];
	drop: [event: DragEvent];
	"drag-end": [];
	"confirm-rename": [];
	"cancel-rename": [];
	"rename-blur": [];
}>();

const vFocus: Directive<HTMLInputElement> = {
	mounted(element) {
		element.focus();
		element.select();
	},
};

function onMenuAction(actionId: string): void {
	if (actionId === "add-bookmark") {
		emit("add-bookmark");
		return;
	}

	if (actionId === "create") {
		emit("create-folder");
		return;
	}

	if (actionId === "collapse-others") {
		emit("collapse-others");
		return;
	}

	if (actionId === "collapse-all") {
		emit("collapse-all");
		return;
	}

	if (actionId === "rename") {
		emit("start-rename");
		return;
	}

	emit("delete-folder");
}
</script>

<template>
	<div
		class="folder-row"
		:class="[{ 'top-level': folder.displayDepth === 0 }, dropClass]"
		:draggable="folder.canModify && !renaming && !busy"
		@dragstart="emit('drag-start', $event)"
		@dragover="emit('drag-over', $event)"
		@drop="emit('drop', $event)"
		@dragend="emit('drag-end')"
		@contextmenu="emit('context-menu', $event)">
		<button
			v-if="folder.displayDepth > 0"
			class="tree-toggle"
			type="button"
			:disabled="!hasContent"
			:title="expanded ? '折叠' : '展开'"
			@click.stop="emit('toggle-expanded')">
			<img
				class="tree-toggle-icon"
				:src="
					hasContent && expanded
						? '/sidepanel/filter-toggle-expanded.png'
						: '/sidepanel/filter-toggle-collapsed.png'
				"
				alt=""
				aria-hidden="true" />
		</button>
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
			@blur="emit('rename-blur')" />
		<span v-else class="folder-title" @dblclick.stop="emit('folder-double-click')">
			{{ folder.title }}
		</span>
		<span class="folder-count">{{ folder.bookmarks.length }}</span>
		<button
			class="row-action primary-action"
			type="button"
			:disabled="busy"
			title="添加当前搜索到此文件夹"
			@click.stop="emit('add-bookmark')">
			添加书签
		</button>
		<button
			v-if="folder.displayDepth === 0"
			class="row-action secondary-action"
			type="button"
			:disabled="busy"
			title="添加子文件夹"
			@click.stop="emit('create-folder')">
			添加文件夹
		</button>
		<button
			v-if="folder.displayDepth > 0 && folder.canModify"
			class="row-action secondary-action"
			type="button"
			:disabled="busy"
			title="重命名文件夹"
			@click.stop="emit('start-rename')">
			重命名
		</button>
		<BookmarkMenu
			:open="menuOpen"
			:disabled="busy"
			:menu-style="menuStyle"
			:actions="
				folder.displayDepth === 0
					? [
							{ id: 'add-bookmark', label: '添加当前搜索' },
							{ id: 'create', label: '添加文件夹' },
							{ id: 'collapse-all', label: '折叠所有' },
						]
					: [
							{ id: 'add-bookmark', label: '添加当前搜索' },
							{ id: 'create', label: '添加文件夹' },
							{ id: 'collapse-others', label: '折叠其他文件夹' },
							{ id: 'rename', label: '重命名', disabled: !folder.canModify },
							{ id: 'delete', label: '删除', disabled: !folder.canModify },
						]
			"
			@toggle="emit('toggle-menu')"
			@select="onMenuAction" />
	</div>
</template>

<style scoped>
.folder-row {
	position: relative;
	display: grid;
	grid-template-columns: 15px minmax(0, 1fr) auto auto auto auto;
	align-items: center;
	box-sizing: border-box;
	height: 30px;
	margin-bottom: 3px;
	gap: 7px;
	border: 0;
	border-bottom: 1px solid #465260;
	border-radius: 0;
	padding: 0 4px;
	color: #dfcf99;
	background: #000;
	text-shadow: 1px 1px 2px #1e2124;
}

.folder-row.top-level {
	grid-template-columns: minmax(0, 1fr) auto auto auto auto;
	height: auto;
	min-height: 31px;
	margin-bottom: 0;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	padding-right: 4px;
	color: var(--color-text-primary);
	background: #101112;
	text-shadow: none;
}

.folder-row:hover {
	color: #fff;
}

.folder-row.top-level:hover {
	border-color: #000;
	border-left-color: #a38d6d;
	background: #181818;
}

.folder-row[draggable="true"] {
	cursor: grab;
}

.folder-row.dragging-source {
	opacity: 0.48;
}

.folder-row.drop-inside {
	outline: 1px solid #dfcf99;
	background: #1e2124;
}

.folder-row.drop-before,
.folder-row.drop-after {
	box-shadow: inset 0 2px 0 var(--color-accent-bright);
}

.folder-row.drop-after {
	box-shadow: inset 0 -2px 0 var(--color-accent-bright);
}

.tree-toggle {
	display: grid;
	width: 15px;
	height: 15px;
	border: 0;
	padding: 0;
	background: transparent;
	place-items: center;
	cursor: pointer;
}

.tree-toggle:disabled {
	cursor: default;
}

.tree-toggle-icon {
	display: block;
	width: 15px;
	height: 15px;
}

.folder-title {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	height: 30px;
	overflow: hidden;
	padding: 6px 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: #fff8e1;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 1.1em;
	font-weight: 400;
}

.top-level .folder-title {
	height: auto;
	padding: 0;
	color: #e2e2e2;
	font-size: inherit;
}

.folder-count {
	color: #a38d6d;
	font-size: 11px;
}

.row-action {
	min-height: 25px;
	border: 1px solid #444;
	border-radius: 0;
	padding: 0 6px;
	background: #1e2124;
	color: #e2e2e2;
	font: inherit;
	font-size: 12px;
	white-space: nowrap;
	cursor: pointer;
}

.row-action:hover {
	border-color: #666;
	color: #fff;
	background: #292d30;
}

.row-action:disabled {
	opacity: 0.6;
	cursor: default;
}

.rename-input {
	min-width: 0;
	width: 100%;
	height: 26px;
	border: 1px solid #a38d6d;
	border-radius: 0;
	padding: 0 6px;
	color: var(--color-text-secondary);
	background: #1e2124;
	box-shadow: var(--shadow-inset);
	font: inherit;
}

@media (max-width: 430px) {
	.folder-row {
		grid-template-columns: 15px minmax(0, 1fr) auto auto auto;
	}

	.folder-row.top-level {
		grid-template-columns: minmax(0, 1fr) auto auto auto;
	}

	.folder-row .secondary-action {
		display: none;
	}
}
</style>
