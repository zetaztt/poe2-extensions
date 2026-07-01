<script lang="ts" setup>
import type { Directive } from "vue";
import type { TradeBookmarkTreeNode } from "../../bookmarks/bookmarks-types";
import BookmarkIconButton from "./bookmark-icon-button.vue";
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
		class="bookmark-folder-header"
		:class="[{ 'top-level': folder.displayDepth === 0 }, dropClass]"
		:draggable="folder.canModify && !renaming && !busy"
		@dragstart="emit('drag-start', $event)"
		@dragover="emit('drag-over', $event)"
		@drop="emit('drop', $event)"
		@dragend="emit('drag-end')"
		@contextmenu="emit('context-menu', $event)">
		<div class="bookmark-folder-title-bar">
			<div class="bookmark-folder-title-layout">
				<span v-if="folder.displayDepth > 0" class="bookmark-folder-toggle-cell">
					<button
						class="bookmark-folder-toggle-button tree-toggle"
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
				</span>
				<span class="bookmark-folder-title-content">
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
					<span
						v-else
						class="bookmark-folder-title-label bookmark-folder-title-clickable bookmark-folder-title"
						@dblclick.stop="emit('folder-double-click')">
						<span class="bookmark-folder-title-text">{{ folder.title }}</span>
					</span>
					<span v-if="folder.displayDepth > 0" class="bookmark-folder-title-action">
						<BookmarkIconButton
							icon="/sidepanel/bookmark-add.png"
							:disabled="busy"
							title="添加书签"
							@click="emit('add-bookmark')" />
					</span>
					<span v-if="folder.displayDepth === 0" class="bookmark-folder-title-action">
						<BookmarkIconButton
							icon="/sidepanel/bookmark-folder-add.png"
							:disabled="busy"
							title="添加文件夹"
							@click="emit('create-folder')" />
					</span>
				</span>
			</div>
		</div>
		<BookmarkIconButton
			v-if="folder.displayDepth > 0 && folder.canModify"
			class="secondary-action"
			icon="/sidepanel/bookmark-rename.png"
			:disabled="busy"
			title="重命名文件夹"
			@click="emit('start-rename')" />
		<BookmarkIconButton
			class="bookmark-folder-menu-action"
			icon="/sidepanel/bookmark-more.png"
			:disabled="busy"
			title="更多"
			@click="emit('toggle-menu')">
			<BookmarkMenu
				:open="menuOpen"
				:menu-style="menuStyle"
				:actions="
					folder.displayDepth === 0
						? [
								{ id: 'create', label: '添加文件夹' },
								{ id: 'collapse-all', label: '折叠所有' },
							]
						: [
								{ id: 'add-bookmark', label: '添加当前搜索' },
								{ id: 'collapse-others', label: '折叠其他文件夹' },
								{ id: 'rename', label: '重命名', disabled: !folder.canModify },
								{ id: 'delete', label: '删除', disabled: !folder.canModify },
							]
				"
				@select="onMenuAction" />
		</BookmarkIconButton>
	</div>
</template>

<style scoped>
.bookmark-folder-header {
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	align-items: center;
	box-sizing: border-box;
	height: 30px;
	margin-bottom: 3px;
	gap: 7px;
	border: 0;
	border-radius: 0;
	padding: 0;
	color: #dfcf99;
	background: #000;
	text-shadow: 1px 1px 2px #1e2124;
}

.bookmark-folder-header.top-level {
	grid-template-columns: minmax(0, 1fr) auto auto;
	height: auto;
	min-height: 31px;
	margin-bottom: 0;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	color: var(--color-text-primary);
	background: #101112;
	text-shadow: none;
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
	min-width: 0;
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

.bookmark-folder-title-action {
	position: relative;
	display: table-cell;
	width: 1%;
	padding-left: 4px;
	font-size: 0;
	vertical-align: middle;
	white-space: nowrap;
}

.bookmark-folder-toggle-button {
	position: relative;
	display: inline-block;
	margin-bottom: 0;
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

.bookmark-folder-title-label {
	display: table;
	float: left;
	width: 100%;
	min-width: 0;
	height: 30px;
	table-layout: fixed;
	overflow: hidden;
	padding: 5px 0;
	border-bottom: 1px solid #465260;
	color: #fff8e1;
	line-height: 18px;
	text-overflow: ellipsis;
	text-shadow: 1px 1px 2px #1e2124;
	white-space: nowrap;
}

.bookmark-folder-title-clickable {
	cursor: pointer;
}

.bookmark-folder-title {
	box-sizing: border-box;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	font-weight: 400;
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

.top-level .bookmark-folder-title {
	padding: 0;
	border-bottom: 0;
	color: #e2e2e2;
	font-size: inherit;
	text-decoration: none;
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
	.bookmark-folder-header {
		grid-template-columns: minmax(0, 1fr) auto auto;
	}

	.bookmark-folder-header.top-level {
		grid-template-columns: minmax(0, 1fr) auto auto;
	}

	.bookmark-folder-header .secondary-action {
		display: none;
	}
}
</style>
