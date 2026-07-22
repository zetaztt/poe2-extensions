export enum SidepanelSnackBarType {
	Success = 1,
	Error = 2,
}

export type SidepanelSnackBarState = {
	open: boolean;
	message: string;
	type: SidepanelSnackBarType;
	version: number;
};
