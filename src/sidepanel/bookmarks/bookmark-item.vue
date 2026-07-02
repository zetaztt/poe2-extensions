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
		:class="[dropClass, { 'is-renaming': renaming }]"
		:draggable="!renaming && !busy"
		@dragstart="emit('drag-start', $event)"
		@dragover="emit('drag-over', $event)"
		@drop="emit('drop', $event)"
		@dragend="emit('drag-end')"
		@contextmenu="emit('context-menu', $event)">
		<span class="bookmark-item-content">
			<button
				v-if="!renaming"
				class="bookmark-item-title-button"
				type="button"
				:title="bookmark.url"
				@click="emit('open')">
				<span class="bookmark-item-title-text">{{ bookmark.title }}</span>
			</button>
			<span v-else class="bookmark-item-rename-control">
				<span class="bookmark-rename-field">
					<input
						v-model="renameTitle"
						v-focus
						class="bookmark-rename-input"
						type="text"
						:disabled="busy"
						@keydown.enter.prevent="emit('confirm-rename')"
						@keydown.esc.prevent="emit('cancel-rename')"
						@blur="emit('rename-blur')" />
				</span>
			</span>
		</span>
		<BookmarkIconButton
			class="bookmark-item-row-action"
			icon="/sidepanel/bookmark-rename.png"
			:disabled="busy"
			title="重命名书签"
			@click="emit('start-rename')" />
		<BookmarkIconButton
			class="bookmark-item-row-action"
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

.bookmark-item-row.is-renaming {
	margin-bottom: 2px;
}

.bookmark-item-row.is-renaming .bookmark-item-row-action {
	vertical-align: top;
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
	border-collapse: separate;
	vertical-align: middle;
}

.bookmark-item-title-button {
	display: block;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	height: 30px;
	overflow: hidden;
	border-top: 0;
	border-right: 0;
	border-bottom: 0;
	border-left: 1px solid #634928;
	padding: 6px 12px;
	color: #fff8e1;
	background-color: #2d31364d;
	font: inherit;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	font-weight: 400;
	line-height: 18px;
	text-align: left;
	text-overflow: ellipsis;
	white-space: nowrap;
	cursor: pointer;
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

.bookmark-item-rename-control {
	position: relative;
	box-sizing: content-box;
	display: block;
	width: 100%;
	min-width: 0;
	min-height: 30px;
	height: 31px;
	border-left: 1px solid #634928;
	color: #e2e2e2;
	background-color: #2d31364d;
	text-align: left;
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
</style>
