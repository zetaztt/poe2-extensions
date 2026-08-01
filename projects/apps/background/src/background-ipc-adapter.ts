import browser from "webextension-polyfill";
import { IpcConnectionHub, type IpcChannelBackend } from "@poe2-extensions/core/ipc";
import { createTabIpcChannelBackend, installRuntimeIpcServer } from "@poe2-extensions/ipc-webextension";

export function createBackgroundIpcMain(): IpcConnectionHub<void> {
	const hub = new IpcConnectionHub<void>(() => {
		throw new Error("background 不能主动调用 ipcMain 对端");
	});
	installRuntimeIpcServer(
		(connection) => hub.addConnection(connection),
		async () => {
			const tabs = await browser.tabs.query({ url: "https://www.pathofexile.com/trade2*" });
			return tabs.flatMap((tab) => (tab.id === undefined ? [] : [tab.id]));
		},
	);
	return hub;
}

export function createTabIpcWindow(): IpcChannelBackend<number> {
	return createTabIpcChannelBackend();
}
