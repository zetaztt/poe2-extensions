import { createVNode, reactive, render, type VNode } from "vue";
import SidePanelSnackBar from "./side-panel-snack-bar.vue";
import { SidePanelSnackBarType, type SidePanelSnackBarState } from "./side-panel-snack-bar-types.ts";

export { SidePanelSnackBarType } from "./side-panel-snack-bar-types.ts";

const successDurationMs = 3000;
const snackBarState = reactive<SidePanelSnackBarState>({
	open: false,
	message: "",
	type: SidePanelSnackBarType.Success,
	version: 0,
});

let snackBarContainer: HTMLElement | null = null;
let snackBarVNode: VNode | null = null;
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

export function showSnackBar(message: string, type: SidePanelSnackBarType): void {
	const normalizedMessage = message.trim();
	if (!normalizedMessage) {
		dismissSnackBar();
		return;
	}

	ensureSnackBar();
	clearDismissTimeout();

	snackBarState.message = normalizedMessage;
	snackBarState.type = type;
	snackBarState.open = true;
	snackBarState.version += 1;

	if (type === SidePanelSnackBarType.Success) {
		const currentVersion = snackBarState.version;
		dismissTimeout = setTimeout(() => {
			// 版本校验避免已被替换的成功消息计时器关闭后续通知。
			if (snackBarState.version === currentVersion) dismissSnackBar();
		}, successDurationMs);
	}
}

export function dismissSnackBar(): void {
	clearDismissTimeout();
	snackBarState.open = false;
}

function clearDismissTimeout(): void {
	if (dismissTimeout === null) return;

	clearTimeout(dismissTimeout);
	dismissTimeout = null;
}

function ensureSnackBar(): void {
	if (snackBarContainer?.isConnected && snackBarVNode) return;

	snackBarContainer = document.createElement("div");
	snackBarContainer.className = "side-panel-snack-bar-container";
	document.body.append(snackBarContainer);

	snackBarVNode = createVNode(SidePanelSnackBar, {
		state: snackBarState,
		dismissSnackBar,
	});
	render(snackBarVNode, snackBarContainer);
}
