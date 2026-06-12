<script lang="ts" setup>
import type { Directive } from 'vue';
import type { TradeBookmarkItem } from '@/bookmarks/types';
import BookmarkMenu from './bookmark-menu.vue';

defineProps<{
	bookmark: TradeBookmarkItem;
	displayDepth: number;
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
		:style="{ marginLeft: `${Math.max(0, displayDepth) * 8 + 22}px` }"
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
	min-height: 30px;
	margin-top: 2px;
	border: 0;
	border-radius: 6px;
	background: transparent;
}

.bookmark-item:hover {
	background: #33271c;
}

.bookmark-item[draggable='true'] {
	cursor: grab;
}

.bookmark-item.dragging-source {
	opacity: 0.48;
}

.bookmark-item.drop-before,
.bookmark-item.drop-after {
	box-shadow: inset 0 2px 0 #d7a85f;
}

.bookmark-item.drop-after {
	box-shadow: inset 0 -2px 0 #d7a85f;
}

.bookmark-open {
	min-width: 0;
	border: 0;
	padding: 5px 8px;
	color: inherit;
	text-align: left;
	background: transparent;
	font: inherit;
	cursor: pointer;
}

.bookmark-title {
	display: block;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 700;
}

.bookmark-rename {
	min-width: 0;
	padding: 2px 8px;
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
</style>
