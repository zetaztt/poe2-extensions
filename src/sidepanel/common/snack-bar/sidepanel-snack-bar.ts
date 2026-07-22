import { createVNode, reactive, render, type VNode } from "vue";
import SidepanelSnackBar from "./sidepanel-snack-bar.vue";
import { SidepanelSnackBarType, type SidepanelSnackBarState } from "./sidepanel-snack-bar-types.ts";

export { SidepanelSnackBarType } from "./sidepanel-snack-bar-types.ts";

const successDurationMs = 3000;
const snackBarState = reactive<SidepanelSnackBarState>({
	open: false,
	message: "",
	type: SidepanelSnackBarType.Success,
	version: 0,
});

let snackBarContainer: HTMLElement | null = null;
let snackBarVNode: VNode | null = null;
let dismissTimeout: ReturnType<typeof setTimeout> | null = null;

export function showSnackBar(message: string, type: SidepanelSnackBarType): void {
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

	if (type === SidepanelSnackBarType.Success) {
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
	snackBarContainer.className = "sidepanel-snack-bar-container";
	document.body.append(snackBarContainer);

	snackBarVNode = createVNode(SidepanelSnackBar, {
		state: snackBarState,
		dismissSnackBar,
	});
	render(snackBarVNode, snackBarContainer);
}
