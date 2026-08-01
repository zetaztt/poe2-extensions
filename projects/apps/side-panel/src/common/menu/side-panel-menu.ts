import { createVNode, reactive, render, type VNode } from "vue";
import { SidePanelMenuState, SidePanelMenuItem, SidePanelMenuOptions } from "./side-panel-menu-types.ts";
import SidePanelMenu from "./side-panel-menu.vue";

const menuState = reactive<SidePanelMenuState>({
	open: false,
	items: [],
	x: 0,
	y: 0,
	version: 0,
});

let menuContainer: HTMLElement | null = null;
let menuVNode: VNode | null = null;

export function openMenu(items: SidePanelMenuItem[], options: SidePanelMenuOptions): void {
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
	menuContainer.className = "side-panel-menu-container";
	document.body.append(menuContainer);

	menuVNode = createVNode(SidePanelMenu, {
		state: menuState,
		closeMenu,
	});
	render(menuVNode, menuContainer);
}
