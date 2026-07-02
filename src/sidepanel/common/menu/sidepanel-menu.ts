export type SidepanelMenuItem = {
	id: string;
	label: string;
	disabled?: boolean;
	run: () => void | Promise<void>;
};

export type SidepanelMenuOptions = {
	x: number;
	y: number;
	align?: "start" | "end";
};

type PopoverElement = HTMLElement & {
	popover: string | null;
	showPopover: () => void;
	hidePopover: () => void;
};

const MENU_CLASS = "sidepanel-menu";
const STYLE_ID = "sidepanel-menu-style";

let menuRoot: PopoverElement | null = null;

export function openMenu(items: SidepanelMenuItem[], options: SidepanelMenuOptions): void {
	const root = ensureMenuRoot();
	renderMenu(root, items);
	positionMenu(root, options);

	if (root.matches(":popover-open")) root.hidePopover();
	root.showPopover();
}

export function closeMenu(): void {
	if (menuRoot?.matches(":popover-open")) menuRoot.hidePopover();
}

function ensureMenuRoot(): PopoverElement {
	if (menuRoot?.isConnected) return menuRoot;

	injectMenuStyle();

	const root = document.createElement("div") as PopoverElement;
	root.className = MENU_CLASS;
	root.popover = "auto";
	root.addEventListener("click", (event) => event.stopPropagation());
	root.addEventListener("contextmenu", (event) => event.stopPropagation());
	document.body.append(root);
	menuRoot = root;

	return root;
}

function renderMenu(root: HTMLElement, items: SidepanelMenuItem[]): void {
	root.replaceChildren();

	const list = document.createElement("ul");
	list.className = "sidepanel-menu-list";

	for (const item of items) {
		const menuItem = document.createElement("li");
		menuItem.className = "sidepanel-menu-item";

		const button = document.createElement("button");
		button.type = "button";
		button.className = "sidepanel-menu-button";
		button.disabled = Boolean(item.disabled);
		button.textContent = item.label;
		button.addEventListener("click", async (event) => {
			event.stopPropagation();
			if (item.disabled) return;

			try {
				await item.run();
			} finally {
				closeMenu();
			}
		});

		menuItem.append(button);
		list.append(menuItem);
	}

	root.append(list);
}

function positionMenu(root: HTMLElement, options: SidepanelMenuOptions): void {
	root.style.left = `${Math.max(0, options.x)}px`;
	root.style.transform = options.align === "end" ? "translateX(-100%)" : "";
	root.style.top = `${Math.max(0, options.y)}px`;
}

function injectMenuStyle(): void {
	if (document.getElementById(STYLE_ID)) return;

	const style = document.createElement("style");
	style.id = STYLE_ID;
	style.textContent = `
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
`;
	document.head.append(style);
}
