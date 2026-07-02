<script lang="ts" setup>
import { useAttrs } from "vue";

defineOptions({ inheritAttrs: false });

defineProps<{
	icon: string;
	title: string;
	disabled?: boolean;
}>();

const attrs = useAttrs();

const emit = defineEmits<{
	click: [event: MouseEvent];
}>();
</script>

<template>
	<span class="bookmark-icon-button-wrap" :class="attrs.class" :style="attrs.style">
		<button
			class="bookmark-icon-button"
			type="button"
			:disabled="disabled"
			:title="title"
			:aria-label="title"
			@click.stop="emit('click', $event)">
			<span class="bookmark-icon-button-icon" :style="{ backgroundImage: `url(${icon})` }"></span>
		</button>
		<slot></slot>
	</span>
</template>

<style scoped>
.bookmark-icon-button-wrap {
	position: relative;
	display: table-cell;
	width: 1%;
	height: 30px;
	font-size: 0;
	vertical-align: middle;
	white-space: nowrap;
	padding-left: 4px;
}

.bookmark-icon-button {
	position: relative;
	display: inline-block;
	width: 39px;
	height: 30px;
	margin-bottom: 0;
	border: 0;
	border-color: transparent;
	border-radius: 0;
	padding: 0;
	color: #e2e2e2;
	background: transparent;
	background-image: none;
	font: inherit;
	font-size: 13px;
	font-weight: 400;
	line-height: 20px;
	text-align: center;
	vertical-align: middle;
	white-space: nowrap;
	cursor: pointer;
	user-select: none;
}

.bookmark-icon-button:hover:not(:disabled) {
	background-color: #2d3136;
}

.bookmark-icon-button:disabled {
	opacity: 0.6;
	cursor: default;
}

.bookmark-icon-button-icon {
	position: absolute;
	top: 50%;
	left: 50%;
	width: 20px;
	height: 20px;
	margin-top: -10px;
	margin-left: -10px;
	background-repeat: no-repeat;
	background-position: center;
	background-size: contain;
}
</style>
