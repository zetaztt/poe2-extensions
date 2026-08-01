<script lang="ts" setup>
import { SidePanelSnackBarType, type SidePanelSnackBarState } from "./side-panel-snack-bar-types";

defineProps<{
	state: SidePanelSnackBarState;
	dismissSnackBar: () => void;
}>();
</script>

<template>
	<div class="side-panel-snack-bar-region" aria-live="polite" aria-atomic="true">
		<Transition name="side-panel-snack-bar">
			<div
				v-if="state.open"
				class="side-panel-snack-bar"
				:class="{
					'side-panel-snack-bar-success': state.type === SidePanelSnackBarType.Success,
					'side-panel-snack-bar-error': state.type === SidePanelSnackBarType.Error,
				}"
				role="status">
				<span class="side-panel-snack-bar-message">{{ state.message }}</span>
				<button
					v-if="state.type === SidePanelSnackBarType.Error"
					class="side-panel-snack-bar-action"
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
.side-panel-snack-bar-region {
	position: fixed;
	right: 0;
	bottom: 16px;
	left: 0;
	z-index: 1100;
	display: flex;
	justify-content: center;
	pointer-events: none;
}

.side-panel-snack-bar {
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

.side-panel-snack-bar-success {
	border-color: var(--color-success);
}

.side-panel-snack-bar-error {
	border-color: var(--color-danger);
}

.side-panel-snack-bar-message {
	min-width: 0;
	font-size: 12px;
	line-height: 1.5;
	overflow-wrap: anywhere;
}

.side-panel-snack-bar-action {
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

.side-panel-snack-bar-action:hover,
.side-panel-snack-bar-action:focus-visible {
	color: #fff;
	background: rgb(255 255 255 / 8%);
}

.side-panel-snack-bar-enter-active {
	transition:
		opacity 160ms ease-out,
		transform 160ms ease-out;
}

.side-panel-snack-bar-leave-active {
	transition:
		opacity 120ms ease-in,
		transform 120ms ease-in;
}

.side-panel-snack-bar-enter-from,
.side-panel-snack-bar-leave-to {
	opacity: 0;
	transform: translateY(12px);
}

@media (prefers-reduced-motion: reduce) {
	.side-panel-snack-bar-enter-active,
	.side-panel-snack-bar-leave-active {
		transition: none;
	}
}
</style>
