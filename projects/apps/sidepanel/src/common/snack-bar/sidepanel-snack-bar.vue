<script lang="ts" setup>
import { SidepanelSnackBarType, type SidepanelSnackBarState } from "./sidepanel-snack-bar-types";

defineProps<{
	state: SidepanelSnackBarState;
	dismissSnackBar: () => void;
}>();
</script>

<template>
	<div class="sidepanel-snack-bar-region" aria-live="polite" aria-atomic="true">
		<Transition name="sidepanel-snack-bar">
			<div
				v-if="state.open"
				class="sidepanel-snack-bar"
				:class="{
					'sidepanel-snack-bar-success': state.type === SidepanelSnackBarType.Success,
					'sidepanel-snack-bar-error': state.type === SidepanelSnackBarType.Error,
				}"
				role="status">
				<span class="sidepanel-snack-bar-message">{{ state.message }}</span>
				<button
					v-if="state.type === SidepanelSnackBarType.Error"
					class="sidepanel-snack-bar-action"
					type="button"
					aria-label="关闭错误提示"
					@click="dismissSnackBar">
					关闭
				</button>
			</div>
		</Transition>
	</div>
</template>

<style>
.sidepanel-snack-bar-region {
	position: fixed;
	right: 0;
	bottom: 16px;
	left: 0;
	z-index: 1100;
	display: flex;
	justify-content: center;
	pointer-events: none;
}

.sidepanel-snack-bar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	width: calc(100% - 24px);
	max-width: 480px;
	min-height: 44px;
	padding: 10px 12px;
	border: 1px solid #634928;
	color: var(--color-text-primary);
	background: #181818;
	box-shadow: 0 4px 14px rgb(0 0 0 / 65%);
	pointer-events: auto;
}

.sidepanel-snack-bar-success {
	border-color: var(--color-success);
}

.sidepanel-snack-bar-error {
	border-color: var(--color-danger);
}

.sidepanel-snack-bar-message {
	min-width: 0;
	font-size: 12px;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.sidepanel-snack-bar-action {
	flex: 0 0 auto;
	min-height: 28px;
	padding: 4px 8px;
	border: 0;
	color: var(--color-accent-bright);
	font: inherit;
	font-size: 12px;
	background: transparent;
	cursor: pointer;
}

.sidepanel-snack-bar-action:hover,
.sidepanel-snack-bar-action:focus-visible {
	color: #fff;
	background: rgb(255 255 255 / 8%);
}

.sidepanel-snack-bar-enter-active {
	transition:
		opacity 160ms ease-out,
		transform 160ms ease-out;
}

.sidepanel-snack-bar-leave-active {
	transition:
		opacity 120ms ease-in,
		transform 120ms ease-in;
}

.sidepanel-snack-bar-enter-from,
.sidepanel-snack-bar-leave-to {
	opacity: 0;
	transform: translateY(12px);
}

@media (prefers-reduced-motion: reduce) {
	.sidepanel-snack-bar-enter-active,
	.sidepanel-snack-bar-leave-active {
		transition: none;
	}
}
</style>
