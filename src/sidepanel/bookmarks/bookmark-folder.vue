<script lang="ts" setup>
import type { Directive } from "vue";
import type { TradeBookmarkTreeNode } from "../../bookmarks/bookmarks-types";
import BookmarkIconButton from "./bookmark-icon-button.vue";
import BookmarkMenu from "./bookmark-menu.vue";

defineProps<{
	folder: TradeBookmarkTreeNode;
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
	"add-bookmark": [];
	"start-rename": [];
	"delete-folder": [];
	"collapse-others": [];
	"export-folder": [];
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

function focusRenameInput(element: HTMLInputElement): void {
	if (element.disabled || document.activeElement === element) return;

	element.focus();
	element.select();
}

const vFocus: Directive<HTMLInputElement> = {
	mounted(element) {
		focusRenameInput(element);
	},
	updated(element) {
		focusRenameInput(element);
	},
};

function toggleFolderExpanded(): void {
	emit("toggle-expanded");
}

function onMenuAction(actionId: string): void {
	if (actionId === "add-bookmark") {
		emit("add-bookmark");
		return;
	}

	if (actionId === "collapse-others") {
		emit("collapse-others");
		return;
	}

	if (actionId === "export") {
		emit("export-folder");
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
		class="bookmark-folder-header"
		:class="[{ 'is-renaming': renaming }, dropClass]"
		:draggable="folder.canModify && !renaming && !busy"
		@dragstart="emit('drag-start', $event)"
		@dragover="emit('drag-over', $event)"
		@drop="emit('drop', $event)"
		@dragend="emit('drag-end')"
		@contextmenu="emit('context-menu', $event)">
		<div class="bookmark-folder-title-bar">
			<div class="bookmark-folder-title-layout">
				<span class="bookmark-folder-toggle-cell">
					<button
						class="bookmark-folder-toggle-button tree-toggle"
						type="button"
						:disabled="!hasContent"
						:title="expanded ? '折叠' : '展开'"
						@click.stop="toggleFolderExpanded">
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
				</span>
				<span class="bookmark-folder-title-content">
					<span v-if="renaming" class="bookmark-folder-rename-control">
						<span class="bookmark-rename-field">
							<input
								v-model="renameTitle"
								v-focus
								class="bookmark-rename-input"
								type="text"
								:disabled="busy"
								@click.stop
								@dblclick.stop
								@keydown.enter.prevent="emit('confirm-rename')"
								@keydown.esc.prevent="emit('cancel-rename')"
								@blur="emit('rename-blur')" />
						</span>
					</span>
					<span v-else class="bookmark-folder-title" @click.stop="toggleFolderExpanded" @dblclick.stop>
						<span class="bookmark-folder-title-text">{{ folder.title }}</span>
					</span>
					<BookmarkIconButton
						class="bookmark-folder-header-action bookmark-folder-add-action"
						icon="/sidepanel/bookmark-add.png"
						:disabled="busy"
						title="添加书签"
						@click="emit('add-bookmark')" />

					<BookmarkIconButton
						v-if="folder.canModify"
						class="bookmark-folder-header-action bookmark-folder-rename-action"
						icon="/sidepanel/bookmark-rename.png"
						:disabled="busy"
						title="重命名文件夹"
						@click="emit('start-rename')" />
					<BookmarkIconButton
						class="bookmark-folder-header-action bookmark-folder-menu-action"
						icon="/sidepanel/bookmark-more.png"
						:disabled="busy"
						title="更多"
						@click="emit('toggle-menu')">
						<BookmarkMenu
							:open="menuOpen"
							placement="folder-title"
							:menu-style="menuStyle"
							:actions="[
								{ id: 'add-bookmark', label: '添加当前搜索' },
								{ id: 'collapse-others', label: '折叠其他文件夹' },
								{ id: 'export', label: '导出文件夹 JSON' },
								{ id: 'rename', label: '重命名', disabled: !folder.canModify },
								{ id: 'delete', label: '删除', disabled: !folder.canModify },
							]"
							@select="onMenuAction" />
					</BookmarkIconButton>
				</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.bookmark-folder-header {
	position: relative;
	display: table;
	width: 100%;
	box-sizing: border-box;
	height: 30px;
	margin-bottom: 3px;
	border-collapse: separate;
	border: 0;
	border-radius: 0;
	padding: 0;
	color: #dfcf99;
	background: #000;
	text-shadow: 1px 1px 2px #1e2124;
}

.bookmark-folder-header.is-renaming {
	margin-bottom: 2px;
}

.bookmark-folder-header.is-renaming .bookmark-folder-header-action {
	vertical-align: top;
}

.bookmark-folder-header[draggable="true"] {
	cursor: grab;
}

.bookmark-folder-header.dragging-source {
	opacity: 0.48;
}

.bookmark-folder-header.drop-inside {
	outline: 1px solid #dfcf99;
	background: #1e2124;
}

.bookmark-folder-header.drop-before,
.bookmark-folder-header.drop-after {
	box-shadow: inset 0 2px 0 var(--color-accent-bright);
}

.bookmark-folder-header.drop-after {
	box-shadow: inset 0 -2px 0 var(--color-accent-bright);
}

.bookmark-folder-title-bar {
	display: table-cell;
	width: 100%;
	min-width: 0;
	vertical-align: middle;
}

.bookmark-folder-title-layout {
	position: relative;
	display: table;
	width: 100%;
	margin-bottom: 3px;
	border-collapse: separate;
	min-width: 0;
}

.bookmark-folder-toggle-cell {
	position: relative;
	display: table-cell;
	width: 42px;
	padding-left: 4px;
	font-size: 0;
	vertical-align: middle;
	white-space: nowrap;
}

.bookmark-folder-toggle-cell:first-child {
	padding-right: 4px;
	padding-left: 0;
}

.bookmark-folder-toggle-button {
	position: relative;
	display: inline-block;
	margin-bottom: 0;
	margin-right: -1px;
	border: 1px solid #000;
	border-radius: 0;
	padding: 5px 12px;
	color: #e2e2e2;
	background: #1e2124;
	background-image: none;
	font: inherit;
	font-size: 13px;
	font-weight: 400;
	line-height: 20px;
	text-align: center;
	vertical-align: middle;
	white-space: nowrap;
	cursor: pointer;
	user-select: none;
}

.bookmark-folder-title-bar .bookmark-folder-toggle-button {
	border: 0;
}

.tree-toggle {
	width: 39px;
	height: 30px;
	padding: 0;
	background: transparent;
}

.tree-toggle:disabled {
	cursor: default;
}

.tree-toggle-icon {
	position: absolute;
	top: 50%;
	left: 50%;
	display: block;
	width: 15px;
	height: 15px;
	margin-top: -7.5px;
	margin-left: -7.5px;
}

.bookmark-folder-title-content {
	position: relative;
	display: table;
	width: 100%;
	border-collapse: separate;
	vertical-align: top;
	min-width: 0;
}

.bookmark-folder-title {
	display: table-cell;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	height: 30px;
	table-layout: fixed;
	overflow: hidden;
	padding: 5px 0;
	border-bottom: 1px solid #465260;
	color: #fff8e1;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	font-weight: 400;
	line-height: 18px;
	text-overflow: ellipsis;
	text-shadow: 1px 1px 2px #1e2124;
	white-space: nowrap;
	cursor: pointer;
}

.bookmark-folder-title-text {
	display: inline-block;
	width: 100%;
	overflow: hidden;
	line-height: 18px;
	text-overflow: ellipsis;
	vertical-align: middle;
	white-space: nowrap;
}

.bookmark-folder-rename-control {
	position: relative;
	box-sizing: content-box;
	display: table-cell;
	width: 100%;
	min-width: 0;
	min-height: 30px;
	height: 31px;
	color: #e2e2e2;
	text-align: left;
	vertical-align: top;
	z-index: 5;
}

.bookmark-rename-field {
	display: block;
	width: 100%;
	min-height: 30px;
	height: 100%;
	max-height: 30px;
	overflow: hidden;
	border: 1px solid #000;
	border-radius: 0;
	padding: 4px 7px;
	background: #1e2124;
	font-size: 14px;
}

.bookmark-rename-input {
	position: relative;
	display: inline-block;
	width: 100%;
	min-width: 0;
	min-height: 20px;
	margin: 0;
	border: 0;
	border-radius: 0;
	padding: 1px 0 0 5px;
	color: #e2e2e2;
	background: transparent;
	font: inherit;
	line-height: 20px;
	box-shadow: none;
	outline: 0;
	transition: border 0.1s ease;
}

.bookmark-rename-input::placeholder {
	color: #707070;
}

@media (max-width: 430px) {
	.bookmark-folder-header {
		display: table;
		width: 100%;
	}

	.bookmark-folder-header .bookmark-folder-rename-action {
		display: none;
	}
}
</style>
