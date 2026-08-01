import browser from "webextension-polyfill";
import "./background-ipc-channels";
import { tradeBookmarkBackground } from "./modules/bookmarks/bookmarks-background";
import { dictionaryBackground } from "./modules/dictionary/dictionary-background";
import { settingsBackground } from "./modules/settings/settings-background";
import { tradeBackground } from "./modules/trade/trade-background";

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
