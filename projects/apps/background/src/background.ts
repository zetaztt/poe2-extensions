import browser from "webextension-polyfill";
import { ipcMain, ipcWindow } from "@poe2-extensions/core/ipc";
import { createBackgroundIpcMain, createTabIpcWindow } from "./ipc-adapter";
import { tradeBookmarkBackground } from "./modules/bookmarks/bookmarks-background";
import { dictionaryBackground } from "./modules/dictionary/dictionary-background";
import { settingsBackground } from "./modules/settings/settings-background";
import { tradeBackground } from "./modules/trade/trade-background";

ipcMain.register(createBackgroundIpcMain);
ipcWindow.register(createTabIpcWindow);

console.debug("[poe2-extensions] background loaded.", { id: browser.runtime.id });
void enableSidePanelOnActionClick();
settingsBackground.install();
tradeBookmarkBackground.install();
dictionaryBackground.install();
tradeBackground.install();

async function enableSidePanelOnActionClick(): Promise<void> {
	if (CHROME) {
		try {
			await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
		} catch (error) {
			console.warn("[poe2-extensions] 侧边栏点击行为设置失败", error);
		}

		chrome.action.onClicked.addListener((tab) => {
			void chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => {
				console.warn("[poe2-extensions] 侧边栏打开失败", error);
			});
		});
	}
}
