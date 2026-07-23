<script lang="ts" setup>
import type { TradeBookmarkRoot } from "../../modules/bookmarks/bookmarks-types";
import BookmarkIconButton from "./bookmark-icon-button.vue";

const props = defineProps<{
	folder: TradeBookmarkRoot;
	busy: boolean;
	dropClass: Record<string, boolean>;
	onCreateFolder?: () => void;
	onOpenMenu?: (event: MouseEvent) => void;
	onContextMenu?: (event: MouseEvent) => void;
	onDragOver?: (event: DragEvent) => void;
	onDrop?: (event: DragEvent) => void;
	onDragEnd?: () => void;
}>();

function createFolder(): void {
	props.onCreateFolder?.();
}

function openMenu(event: MouseEvent): void {
	props.onOpenMenu?.(event);
}

function openContextMenu(event: MouseEvent): void {
	props.onContextMenu?.(event);
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
</script>

<template>
	<div
		class="bookmark-tree-header"
		:class="dropClass"
		:draggable="false"
		@dragover="onDragOver"
		@drop="onDrop"
		@dragend="onDragEnd"
		@contextmenu="openContextMenu">
		<div class="bookmark-tree-header-title-bar">
			<div class="bookmark-tree-header-title-layout">
				<span class="bookmark-tree-header-title-content">
					<span class="bookmark-tree-header-title" @dblclick.stop>
						<span class="bookmark-tree-header-title-text">Trade 书签</span>
					</span>
					<BookmarkIconButton
						class="bookmark-tree-header-action bookmark-tree-header-add-action"
						icon="/sidepanel/bookmark-folder-add.png"
						:disabled="busy"
						title="添加文件夹"
						:on-click="createFolder" />
					<BookmarkIconButton
						class="bookmark-tree-header-action bookmark-tree-header-menu-action"
						icon="/sidepanel/bookmark-more.png"
						:disabled="busy"
						title="更多"
						:on-click="openMenu" />
				</span>
			</div>
		</div>
	</div>
</template>

<style scoped>
.bookmark-tree-header {
	position: relative;
	display: table;
	width: 100%;
	box-sizing: border-box;
	height: auto;
	min-height: 31px;
	margin-bottom: 0;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	border-collapse: separate;
	border-radius: 0;
	padding: 0;
	color: var(--color-text-primary);
	background: #101112;
	text-shadow: none;
}

.bookmark-tree-header[draggable="true"] {
	cursor: grab;
}

.bookmark-tree-header.dragging-source {
	opacity: 0.48;
}

.bookmark-tree-header.drop-inside {
	outline: 1px solid #dfcf99;
	background: #1e2124;
}

.bookmark-tree-header.drop-before,
.bookmark-tree-header.drop-after {
	box-shadow: inset 0 2px 0 var(--color-accent-bright);
}

.bookmark-tree-header.drop-after {
	box-shadow: inset 0 -2px 0 var(--color-accent-bright);
}

.bookmark-tree-header-title-bar {
	display: table-cell;
	width: 100%;
	min-width: 0;
	vertical-align: middle;
}

.bookmark-tree-header-title-layout {
	position: relative;
	display: table;
	width: 100%;
	margin-bottom: 3px;
	border-collapse: separate;
	min-width: 0;
}

.bookmark-tree-header-title-content {
	position: relative;
	display: table;
	width: 100%;
	border-collapse: separate;
	vertical-align: top;
	min-width: 0;
}

.bookmark-tree-header-title {
	display: table-cell;
	box-sizing: border-box;
	width: 100%;
	min-width: 0;
	height: 30px;
	table-layout: fixed;
	overflow: hidden;
	padding: 0;
	border-bottom: 0;
	color: #e2e2e2;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: inherit;
	font-weight: 400;
	line-height: 18px;
	text-overflow: ellipsis;
	text-decoration: none;
	white-space: nowrap;
	cursor: default;
}

.bookmark-tree-header-title-text {
	display: inline-block;
	width: 100%;
	overflow: hidden;
	line-height: 18px;
	text-overflow: ellipsis;
	vertical-align: middle;
	white-space: nowrap;
}

@media (max-width: 430px) {
	.bookmark-tree-header {
		display: table;
		width: 100%;
	}
}
</style>
