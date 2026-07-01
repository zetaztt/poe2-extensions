<script lang="ts" setup>
defineProps<{
	open: boolean;
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
