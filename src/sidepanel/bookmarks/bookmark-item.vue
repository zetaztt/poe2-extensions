<script lang="ts" setup>
import type { Directive } from "vue";
import type { TradeBookmarkItem } from "../../bookmarks/bookmarks-types";
import BookmarkIconButton from "./bookmark-icon-button.vue";

defineProps<{
	bookmark: TradeBookmarkItem;
	busy: boolean;
	renaming: boolean;
	dropClass: Record<string, boolean>;
}>();

const renameTitle = defineModel<string>("renameTitle", { required: true });

const emit = defineEmits<{
	open: [];
	"start-rename": [];
	"open-menu": [event: MouseEvent];
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

function openBookmark(): void {
	emit("open");
}

function startRename(): void {
	emit("start-rename");
}

function openMenu(event: MouseEvent): void {
	emit("open-menu", event);
}

function openContextMenu(event: MouseEvent): void {
	emit("context-menu", event);
}

function onDragStart(event: DragEvent): void {
	emit("drag-start", event);
}

function onDragOver(event: DragEvent): void {
	emit("drag-over", event);
}

function onDrop(event: DragEvent): void {
	emit("drop", event);
}

function onDragEnd(): void {
	emit("drag-end");
}

function confirmRename(): void {
	emit("confirm-rename");
}

function cancelRename(): void {
	emit("cancel-rename");
}

function onRenameBlur(): void {
	emit("rename-blur");
}
</script>

<template>
	<div
		class="bookmark-item-row"
		:class="[dropClass, { 'is-renaming': renaming }]"
		:draggable="!renaming && !busy"
		@dragstart="onDragStart"
		@dragover="onDragOver"
		@drop="onDrop"
		@dragend="onDragEnd"
		@contextmenu="openContextMenu">
		<span class="bookmark-item-content">
			<button
				v-if="!renaming"
				class="bookmark-item-title-button"
				type="button"
				:title="bookmark.url"
				@click="openBookmark">
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
						@keydown.enter.prevent="confirmRename"
						@keydown.esc.prevent="cancelRename"
						@blur="onRenameBlur" />
				</span>
			</span>
		</span>
		<BookmarkIconButton
			class="bookmark-item-row-action"
			icon="/sidepanel/bookmark-rename.png"
			:disabled="busy"
			title="重命名书签"
			@click="startRename" />
		<BookmarkIconButton
			class="bookmark-item-row-action"
			icon="/sidepanel/bookmark-more.png"
			:disabled="busy"
			title="更多"
			@click="openMenu" />
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
