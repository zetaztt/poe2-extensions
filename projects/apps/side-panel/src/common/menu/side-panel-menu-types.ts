export type SidePanelMenuItem = {
	id: string;
	label: string;
	disabled?: boolean;
	run: () => void | Promise<void>;
};

export enum SidePanelMenuAlign {
	Start = 1,
	End = 2,
}

export type SidePanelMenuOptions = {
	x: number;
	y: number;
	align?: SidePanelMenuAlign;
};

export type SidePanelMenuState = {
	open: boolean;
	items: SidePanelMenuItem[];
	x: number;
	y: number;
	align?: SidePanelMenuAlign;
	version: number;
};
