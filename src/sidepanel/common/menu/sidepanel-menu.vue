<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { SidepanelMenuAlign, type SidepanelMenuState } from "./sidepanel-menu-types";

type PopoverElement = HTMLElement & {
	popover: string | null;
	showPopover: () => void;
	hidePopover: () => void;
};

const props = defineProps<{
	state: SidepanelMenuState;
	closeMenu: () => void;
}>();

const menuRoot = ref<PopoverElement | null>(null);

const menuStyle = computed<Record<string, string>>(() => ({
	left: `${props.state.x}px`,
	top: `${props.state.y}px`,
	transform: props.state.align === SidepanelMenuAlign.End ? "translateX(-100%)" : "",
}));

watch(
	() => [props.state.open, props.state.version] as const,
	async ([open]) => {
		await nextTick();

		const root = menuRoot.value;
		if (!root) return;

		if (open) {
			if (root.matches(":popover-open")) root.hidePopover();
			root.showPopover();
			return;
		}

		if (root.matches(":popover-open")) root.hidePopover();
	},
	{ immediate: true },
);

onMounted(() => {
	window.addEventListener("pointerdown", onGlobalPointerDown, true);
	window.addEventListener("keydown", onGlobalKeyDown, true);
	window.addEventListener("dragstart", onGlobalDragStart, true);
});

onBeforeUnmount(() => {
	window.removeEventListener("pointerdown", onGlobalPointerDown, true);
	window.removeEventListener("keydown", onGlobalKeyDown, true);
	window.removeEventListener("dragstart", onGlobalDragStart, true);
});

function onGlobalPointerDown(event: PointerEvent): void {
	if (!props.state.open) return;

	const root = menuRoot.value;
	const target = event.target;
	if (root && target instanceof Node && root.contains(target)) return;

	props.closeMenu();
}

function onGlobalKeyDown(event: KeyboardEvent): void {
	if (props.state.open && event.key === "Escape") props.closeMenu();
}

function onGlobalDragStart(): void {
	if (props.state.open) props.closeMenu();
}

async function runMenuItem(item: SidepanelMenuState["items"][number], event: MouseEvent): Promise<void> {
	event.stopPropagation();
	if (item.disabled) return;

	try {
		await item.run();
	} finally {
		props.closeMenu();
	}
}
</script>

<template>
	<div ref="menuRoot" class="sidepanel-menu" popover="manual" :style="menuStyle" @click.stop @contextmenu.stop>
		<ul class="sidepanel-menu-list">
			<li v-for="item in state.items" :key="item.id" class="sidepanel-menu-item">
				<button
					class="sidepanel-menu-button"
					type="button"
					:disabled="Boolean(item.disabled)"
					@click="runMenuItem(item, $event)">
					{{ item.label }}
				</button>
			</li>
		</ul>
	</div>
</template>

<style>
.sidepanel-menu {
	position: fixed;
	inset: auto;
	z-index: 1000;
	min-width: 132px;
	max-height: 240px;
	overflow-x: hidden;
	overflow-y: auto;
	margin: 0;
	padding: 0;
	border: 1px solid #634928;
	border-top-color: transparent;
	border-radius: 0;
	color: #e2e2e2;
	background: #000;
}

.sidepanel-menu::backdrop {
	background: transparent;
}

.sidepanel-menu-list {
	display: inline-block;
	min-width: 100%;
	margin: 0;
	padding: 0;
	border: 0;
	border-radius: 0;
	background-color: #1e2124;
	list-style: none;
}

.sidepanel-menu-item {
	display: block;
}

.sidepanel-menu-button {
	display: block;
	width: 100%;
	height: 30px;
	min-height: 30px;
	border: 0;
	border-radius: 0;
	padding: 8px 12px;
	color: #e2e2e2;
	font: inherit;
	line-height: 16px;
	text-align: left;
	background: transparent;
	cursor: pointer;
	white-space: nowrap;
}

.sidepanel-menu-button:hover:not(:disabled),
.sidepanel-menu-button:focus-visible:not(:disabled) {
	color: #e2e2e2;
	background-color: #465260;
	outline: 0;
}

.sidepanel-menu-button:disabled {
	color: #777;
	background-color: #000;
	cursor: default;
}
</style>
