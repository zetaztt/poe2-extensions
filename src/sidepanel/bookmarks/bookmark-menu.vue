<script lang="ts" setup>
defineProps<{
	open: boolean;
	placement?: "bookmark-row" | "folder-title";
	menuStyle?: Record<string, string>;
	actions: Array<{
		id: string;
		label: string;
		disabled?: boolean;
		run: () => void;
	}>;
}>();
</script>

<template>
	<span class="bookmark-action-menu-anchor">
		<div
			v-if="open"
			class="bookmark-action-menu"
			:class="{ 'bookmark-action-menu--folder-title': placement === 'folder-title' }"
			:style="menuStyle"
			@click.stop>
			<ul class="bookmark-action-menu-list">
				<li v-for="action in actions" :key="action.id" class="bookmark-action-menu-item">
					<button
						type="button"
						class="bookmark-action-menu-button"
						:disabled="action.disabled"
						@click="action.run()">
						<span>{{ action.label }}</span>
					</button>
				</li>
			</ul>
		</div>
	</span>
</template>

<style scoped>
.bookmark-action-menu-anchor {
	position: relative;
	display: inline-block;
	width: 0;
	height: 0;
	vertical-align: top;
}

.bookmark-action-menu {
	position: absolute;
	top: 30px;
	right: 0;
	z-index: 30;
	min-width: 132px;
	max-height: 240px;
	overflow-x: hidden;
	overflow-y: auto;
	padding: 0;
	border: 1px solid #634928;
	border-top-color: transparent;
	border-radius: 0;
	background: #000;
	margin-top: 1px;
}

.bookmark-action-menu--folder-title {
	margin-top: -3px;
}

.bookmark-action-menu-list {
	display: inline-block;
	min-width: 100%;
	margin: 0;
	padding: 0;
	border: 0;
	border-radius: 0;
	background-color: #1e2124;
	list-style: none;
}

.bookmark-action-menu-item {
	display: block;
}

.bookmark-action-menu-button {
	display: block;
	width: 100%;
	height: 30px;
	min-height: 30px;
	border: 0;
	border-radius: 0;
	padding: 8px 12px;
	color: #e2e2e2;
	line-height: 16px;
	text-align: left;
	background: transparent;
	cursor: pointer;
	white-space: nowrap;
}

.bookmark-action-menu-button:hover:not(:disabled),
.bookmark-action-menu-button:focus-visible:not(:disabled) {
	color: #e2e2e2;
	background-color: #465260;
	outline: 0;
}

.bookmark-action-menu-button:disabled {
	color: #777;
	background-color: #000;
	cursor: default;
}
</style>
