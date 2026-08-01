import { ipcMain, ipcWindow } from "@poe2-extensions/core/ipc";
import { createMainWorldIpcMain, createMainWorldIpcWindow } from "./inject-ipc-adapter";

export type InjectScriptMain = () => void | Promise<void>;

export interface BootstrapInjectScriptOptions {
	registerIpcWindow?: boolean;
}

export function bootstrapInjectScript(main: InjectScriptMain, options: BootstrapInjectScriptOptions = {}): void {
	ipcMain.register(createMainWorldIpcMain);
	if (options.registerIpcWindow) {
		ipcWindow.register(createMainWorldIpcWindow);
	}

	try {
		const result = main();
		if (result) {
			void result.catch((error) => {
				console.error("[poe2-extensions] inject script 初始化失败", error);
			});
		}
	} catch (error) {
		console.error("[poe2-extensions] inject script 初始化失败", error);
	}
}
