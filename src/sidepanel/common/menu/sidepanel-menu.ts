import { createVNode, reactive, render, type VNode } from "vue";
import SidepanelMenu from "./sidepanel-menu.vue";
import type { SidepanelMenuItem, SidepanelMenuOptions, SidepanelMenuState } from "./sidepanel-menu-types";

export { SidepanelMenuAlign, type SidepanelMenuItem, type SidepanelMenuOptions } from "./sidepanel-menu-types";

const menuState = reactive<SidepanelMenuState>({
	open: false,
	items: [],
	x: 0,
	y: 0,
	version: 0,
});

let menuContainer: HTMLElement | null = null;
let menuVNode: VNode | null = null;

export function openMenu(items: SidepanelMenuItem[], options: SidepanelMenuOptions): void {
	ensureMenu();

	menuState.items = items;
	menuState.x = Math.max(0, options.x);
	menuState.y = Math.max(0, options.y);
	menuState.align = options.align;
	menuState.open = true;
	menuState.version += 1;
}

export function closeMenu(): void {
	menuState.open = false;
}

function ensureMenu(): void {
	if (menuContainer?.isConnected && menuVNode) return;

	menuContainer = document.createElement("div");
	menuContainer.className = "sidepanel-menu-container";
	document.body.append(menuContainer);

	menuVNode = createVNode(SidepanelMenu, {
		state: menuState,
		closeMenu,
	});
	render(menuVNode, menuContainer);
}
