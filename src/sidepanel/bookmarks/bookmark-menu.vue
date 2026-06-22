<script lang="ts" setup>
defineProps<{
	open: boolean;
	disabled: boolean;
	menuStyle?: Record<string, string>;
	actions: Array<{
		id: string;
		label: string;
		disabled?: boolean;
	}>;
}>();

const emit = defineEmits<{
	toggle: [];
	select: [actionId: string];
}>();
</script>

<template>
	<div class="more-wrap">
		<button class="more-button" type="button" :disabled="disabled" title="更多" @click.stop="emit('toggle')">
			⋯
		</button>
		<div v-if="open" class="more-menu" :style="menuStyle" @click.stop>
			<button
				v-for="action in actions"
				:key="action.id"
				type="button"
				:disabled="action.disabled"
				@click="emit('select', action.id)">
				{{ action.label }}
			</button>
		</div>
	</div>
</template>

<style scoped>
.more-wrap {
	position: relative;
}

.more-button {
	width: 26px;
	height: 26px;
	border: 0;
	border-radius: 0;
	padding: 0;
	color: var(--color-text);
	background: transparent;
	font: inherit;
	font-size: 18px;
	line-height: 1;
	cursor: pointer;
}

.more-button:hover {
	background: #1e2124;
	color: #fff;
}

.more-button:disabled {
	opacity: 0.6;
	cursor: default;
}

.more-menu {
	position: absolute;
	top: 30px;
	right: 0;
	z-index: 30;
	min-width: 132px;
	padding: 3px;
	border: 1px solid #444;
	border-radius: 0;
	background: #000;
	box-shadow: 0 4px 16px #000;
}

.more-menu button {
	display: block;
	width: 100%;
	min-height: 30px;
	border: 0;
	border-radius: 0;
	padding: 0 10px;
	color: var(--color-text-primary);
	text-align: left;
	background: transparent;
	cursor: pointer;
	white-space: nowrap;
}

.more-menu button:hover:not(:disabled) {
	color: #fff;
	background: #1e2124;
}

.more-menu button:disabled {
	opacity: 0.55;
	cursor: default;
}
</style>
