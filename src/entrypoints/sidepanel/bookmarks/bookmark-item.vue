<script lang="ts" setup>
import type { Directive } from 'vue';
import type { TradeBookmarkItem } from '@/bookmarks/types';
import BookmarkMenu from './bookmark-menu.vue';

defineProps<{
	bookmark: TradeBookmarkItem;
	busy: boolean;
	renaming: boolean;
	dropClass: Record<string, boolean>;
	menuOpen: boolean;
	menuStyle?: Record<string, string>;
}>();

const renameTitle = defineModel<string>('renameTitle', { required: true });

const emit = defineEmits<{
	open: [];
	'start-rename': [];
	replace: [];
	delete: [];
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
	if (actionId === 'rename') {
		emit('start-rename');
		return;
	}

	if (actionId === 'replace') {
		emit('replace');
		return;
	}

	emit('delete');
}
</script>

<template>
	<div
		class="bookmark-item"
		:class="dropClass"
		:draggable="!renaming && !busy"
		@dragstart="emit('drag-start', $event)"
		@dragover="emit('drag-over', $event)"
		@drop="emit('drop', $event)"
		@dragend="emit('drag-end')"
		@contextmenu="emit('context-menu', $event)"
	>
		<button
			v-if="!renaming"
			class="bookmark-open"
			type="button"
			:title="bookmark.url"
			@click="emit('open')"
		>
			<span class="bookmark-title">{{ bookmark.title }}</span>
		</button>
		<div v-else class="bookmark-rename">
			<input
				v-model="renameTitle"
				v-focus
				class="rename-input"
				type="text"
				:disabled="busy"
				@keydown.enter.prevent="emit('confirm-rename')"
				@keydown.esc.prevent="emit('cancel-rename')"
				@blur="emit('rename-blur')"
			>
		</div>
		<button
			class="row-action"
			type="button"
			:disabled="busy"
			title="重命名书签"
			@click.stop="emit('start-rename')"
		>
			重命名
		</button>
		<BookmarkMenu
			:open="menuOpen"
			:disabled="busy"
			:menu-style="menuStyle"
			:actions="[
				{ id: 'rename', label: '重命名' },
				{ id: 'replace', label: '用当前搜索替换' },
				{ id: 'delete', label: '删除' },
			]"
			@toggle="emit('toggle-menu')"
			@select="onMenuAction"
		/>
	</div>
</template>

<style scoped>
.bookmark-item {
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	align-items: center;
	box-sizing: border-box;
	height: 30px;
	margin-bottom: 3px;
	margin-left: 12px;
	border: 1px solid #000;
	border-left-color: #333;
	border-radius: 0;
	background: #101112;
}

.bookmark-item:hover {
	border-color: #000;
	border-left-color: #a38d6d;
	background: #181818;
}

.bookmark-item[draggable='true'] {
	cursor: grab;
}

.bookmark-item.dragging-source {
	opacity: 0.48;
}

.bookmark-item.drop-before,
.bookmark-item.drop-after {
	box-shadow: inset 0 2px 0 var(--color-accent-bright);
}

.bookmark-item.drop-after {
	box-shadow: inset 0 -2px 0 var(--color-accent-bright);
}

.bookmark-open {
	min-width: 0;
	height: 100%;
	border: 0;
	padding: 0;
	color: inherit;
	text-align: left;
	background: transparent;
	font: inherit;
	cursor: pointer;
}

.bookmark-title {
	display: flex;
	align-items: center;
	box-sizing: border-box;
	height: 100%;
	overflow: hidden;
	padding: 6px 12px;
	text-overflow: ellipsis;
	white-space: nowrap;
	color: #fff8e1;
	font-family: FontinRegular, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 1.1em;
	font-weight: 400;
}

.bookmark-rename {
	min-width: 0;
	padding: 2px 8px;
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

@media (max-width: 380px) {
	.row-action {
		display: none;
	}
}
</style>
