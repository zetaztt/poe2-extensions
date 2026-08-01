export enum SidePanelSnackBarType {
	Success = 1,
	Error = 2,
}

export type SidePanelSnackBarState = {
	open: boolean;
	message: string;
	type: SidePanelSnackBarType;
	version: number;
};
