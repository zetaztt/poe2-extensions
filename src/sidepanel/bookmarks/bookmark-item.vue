<script lang="ts" setup>
import { ref, watch, type Directive } from "vue";
import type { TradeBookmarkItem } from "../../modules/bookmarks/bookmarks-types";
import BookmarkIconButton from "./bookmark-icon-button.vue";

const props = defineProps<{
	bookmark: TradeBookmarkItem;
	busy: boolean;
	creating: boolean;
	dropClass: Record<string, boolean>;
	onOpen?: () => void;
	onOpenMenu?: (event: MouseEvent, startRename: () => void) => void;
	onContextMenu?: (event: MouseEvent, startRename: () => void) => void;
	onDragStart?: (event: DragEvent) => void;
	onDragOver?: (event: DragEvent) => void;
	onDrop?: (event: DragEvent) => void;
	onDragEnd?: () => void;
	onConfirmRename?: (title: string) => void;
	onCancelRename?: () => void;
}>();

const renaming = ref(false);
const renameTitle = ref("");

watch(
	() => props.creating,
	(creating) => {
		if (creating) startRename();
	},
	{ immediate: true },
);

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
	props.onOpen?.();
}

function startRename(): void {
	if (props.busy) return;

	renameTitle.value = props.bookmark.title;
	renaming.value = true;
}

function openMenu(event: MouseEvent): void {
	props.onOpenMenu?.(event, startRename);
}

function openContextMenu(event: MouseEvent): void {
	props.onContextMenu?.(event, startRename);
}

function onDragStart(event: DragEvent): void {
	props.onDragStart?.(event);
}

function onDragOver(event: DragEvent): void {
	props.onDragOver?.(event);
}

function onDrop(event: DragEvent): void {
	props.onDrop?.(event);
}

function onDragEnd(): void {
	props.onDragEnd?.();
}

function confirmRename(): void {
	if (!renaming.value) return;

	const title = renameTitle.value;
	renaming.value = false;
	props.onConfirmRename?.(title);
}

function cancelRename(): void {
	if (!renaming.value) return;

	renaming.value = false;
	props.onCancelRename?.();
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
						@blur="confirmRename" />
				</span>
			</span>
		</span>
		<BookmarkIconButton
			class="bookmark-item-row-action"
			icon="/sidepanel/bookmark-rename.png"
			:disabled="busy"
			title="重命名书签"
			:on-click="startRename" />
		<BookmarkIconButton
			class="bookmark-item-row-action"
			icon="/sidepanel/bookmark-more.png"
			:disabled="busy"
			title="更多"
			:on-click="openMenu" />
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
