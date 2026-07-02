<script lang="ts" setup>
defineProps<{
	open: boolean;
	offset?: "bookmark" | "folder";
	menuStyle?: Record<string, string>;
	actions: Array<{
		id: string;
		label: string;
		disabled?: boolean;
	}>;
}>();

const emit = defineEmits<{
	select: [actionId: string];
}>();
</script>

<template>
	<span class="more-wrap">
		<div
			v-if="open"
			class="more-menu multiselect__content-wrapper"
			:class="{ 'folder-offset': offset === 'folder' }"
			:style="menuStyle"
			@click.stop>
			<ul class="multiselect__content">
				<li v-for="action in actions" :key="action.id" class="multiselect__element">
					<button
						type="button"
						class="multiselect__option"
						:class="{ 'multiselect__option--disabled': action.disabled }"
						:disabled="action.disabled"
						@click="emit('select', action.id)">
						<span>{{ action.label }}</span>
					</button>
				</li>
			</ul>
		</div>
	</span>
</template>

<style scoped>
.more-wrap {
	position: relative;
	display: inline-block;
	width: 0;
	height: 0;
	vertical-align: top;
}

.more-menu {
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

.more-menu.folder-offset {
	margin-top: -3px;
}

.multiselect__content {
	display: inline-block;
	min-width: 100%;
	margin: 0;
	padding: 0;
	border: 0;
	border-radius: 0;
	background-color: #1e2124;
	list-style: none;
}

.multiselect__element {
	display: block;
}

.multiselect__option {
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

.multiselect__option:hover:not(:disabled),
.multiselect__option:focus-visible:not(:disabled) {
	color: #e2e2e2;
	background-color: #465260;
	outline: 0;
}

.multiselect__option--disabled,
.multiselect__option:disabled {
	color: #777;
	background-color: #000;
	cursor: default;
}
</style>
