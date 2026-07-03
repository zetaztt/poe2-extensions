export type SidepanelMenuItem = {
	id: string;
	label: string;
	disabled?: boolean;
	run: () => void | Promise<void>;
};

export enum SidepanelMenuAlign {
	Start = 1,
	End = 2,
}

export type SidepanelMenuOptions = {
	x: number;
	y: number;
	align?: SidepanelMenuAlign;
};

export type SidepanelMenuState = {
	open: boolean;
	items: SidepanelMenuItem[];
	x: number;
	y: number;
	align?: SidepanelMenuAlign;
	version: number;
};
