import browser from "webextension-polyfill";
import { installTradeBookmarkHandlers } from "./modules/bookmarks/bookmarks-background-service";
import { installDictionaryHandlers } from "./modules/dictionary/dictionary-background-service";
import { ipcMain, ipcWindow } from "./ipc/ipc";
import { createBackgroundIpcMain, createTabIpcWindow } from "./ipc/ipc-implementations";
import { installTradeSettingsHandlers } from "./modules/settings/settings-background-service";
import { installTradeStatPresetHandlers } from "./trade/stat-preset/trade-stat-preset-storage";
ipcMain.register(createBackgroundIpcMain);
ipcWindow.register(createTabIpcWindow);

console.debug("[poe2-extensions] background loaded.", { id: browser.runtime.id });
void enableSidePanelOnActionClick();
installTradeBookmarkHandlers();
installDictionaryHandlers();
installTradeSettingsHandlers();
installTradeStatPresetHandlers();

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
