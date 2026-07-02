<script lang="ts" setup>
import type { Directive } from "vue";
import type { TradeBookmarkItem } from "../../bookmarks/bookmarks-types";
import BookmarkIconButton from "./bookmark-icon-button.vue";
import BookmarkMenu from "./bookmark-menu.vue";

defineProps<{
	bookmark: TradeBookmarkItem;
	busy: boolean;
	renaming: boolean;
	dropClass: Record<string, boolean>;
	menuOpen: boolean;
	menuStyle?: Record<string, string>;
}>();

const renameTitle = defineModel<string>("renameTitle", { required: true });

const emit = defineEmits<{
	open: [];
	"start-rename": [];
	replace: [];
	delete: [];
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
	if (actionId === "rename") {
		emit("start-rename");
		return;
	}

	if (actionId === "replace") {
		emit("replace");
		return;
	}

	emit("delete");
}
</script>

<template>
	<div
		class="bookmark-item-row"
		:class="dropClass"
		:draggable="!renaming && !busy"
		@dragstart="emit('drag-start', $event)"
		@dragover="emit('drag-over', $event)"
		@drop="emit('drop', $event)"
		@dragend="emit('drag-end')"
		@contextmenu="emit('context-menu', $event)">
		<span class="bookmark-item-content">
			<button
				v-if="!renaming"
				class="bookmark-item-title bookmark-item-title-clickable bookmark-open"
				type="button"
				:title="bookmark.url"
				@click="emit('open')">
				<span class="bookmark-item-title-text">{{ bookmark.title }}</span>
			</button>
			<span v-else class="bookmark-rename">
				<input
					v-model="renameTitle"
					v-focus
					class="rename-input"
					type="text"
					:disabled="busy"
					@keydown.enter.prevent="emit('confirm-rename')"
					@keydown.esc.prevent="emit('cancel-rename')"
					@blur="emit('rename-blur')" />
			</span>
		</span>
		<BookmarkIconButton
			icon="/sidepanel/bookmark-rename.png"
			:disabled="busy"
			title="重命名书签"
			@click="emit('start-rename')" />
		<BookmarkIconButton
			icon="/sidepanel/bookmark-more.png"
			:disabled="busy"
			title="更多"
			@click="emit('toggle-menu')">
			<BookmarkMenu
				:open="menuOpen"
				:menu-style="menuStyle"
				:actions="[
					{ id: 'rename', label: '重命名' },
					{ id: 'replace', label: '用当前搜索替换' },
					{ id: 'delete', label: '删除' },
				]"
				@select="onMenuAction" />
		</BookmarkIconButton>
	</div>
</template>

<style scoped>
.bookmark-item-row {
	position: relative;
	display: table;
	width: 100%;
	margin-bottom: 3px;
	border-collapse: separate;
	padding: 0;
}

.bookmark-item-row[draggable="true"] {
	cursor: grab;
}

.bookmark-item-row.dragging-source {
	opacity: 0.48;
}

.bookmark-item-row.drop-before,
.bookmark-item-row.drop-after {
	box-shadow: inset 0 2px 0 var(--color-accent-bright);
}

.bookmark-item-row.drop-after {
	box-shadow: inset 0 -2px 0 var(--color-accent-bright);
}

.bookmark-item-content {
	position: relative;
	display: table-cell;
	width: 100%;
	min-width: 0;
	vertical-align: middle;
}

.bookmark-item-title {
	display: block;
	width: 100%;
	min-width: 0;
	height: 30px;
	overflow: hidden;
	padding: 6px 12px;
	border-left: 1px solid #634928;
	color: #fff8e1;
	background-color: #2d31364d;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	font-weight: 400;
	line-height: 18px;
	text-align: left;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.bookmark-item-title-clickable {
	cursor: pointer;
}

.bookmark-open {
	box-sizing: border-box;
	border-top: 0;
	border-right: 0;
	border-bottom: 0;
	font: inherit;
}

.bookmark-item-title-text {
	display: inline-block;
	width: 100%;
	overflow: hidden;
	line-height: 18px;
	text-overflow: ellipsis;
	vertical-align: middle;
	white-space: nowrap;
}

.bookmark-rename {
	display: block;
	min-width: 0;
	padding: 2px 8px;
	background-color: #2d31364d;
	border-left: 1px solid #634928;
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
</style>
