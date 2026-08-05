import { ipcMain } from "../../background-ipc-channels";
import { tradeIpcProtocol, tradeSettings } from "@poe2-extensions/core/trade";
import { settingsBackground } from "../settings/settings-background";
import { tradeStatPresetBackground } from "./stat-preset/stat-preset-background";

const tradeTranslateContentScriptId = "poe2-trade-translate-inject";
const tradeTranslateContentScriptPath = "projects/apps/inject/src/trade/translate/trade-translate-inject.ts";

// 动态脚本注册必须串行，避免快速切换时较早的异步结果覆盖最新设置。
let translateInjectionSyncPromise: Promise<void> = Promise.resolve();
let lastSyncedTranslateEnabled: boolean | null = null;
let installed = false;

function install(): void {
	if (installed) throw new Error("trade background 已安装");
	installed = true;
	ipcMain.handle(tradeIpcProtocol.setTranslateEnabled, ({ enabled }) => setTranslateEnabled(enabled));
	ipcMain.handle(tradeIpcProtocol.setItemCopyEnabled, ({ enabled }) => setItemCopyEnabled(enabled));
	ipcMain.handle(tradeIpcProtocol.setStatPresetEnabled, ({ enabled }) => setStatPresetEnabled(enabled));
	settingsBackground.onChanged(tradeSettings.translate, ({ value }) => queueTranslateInjectionSync(value));

	// 动态 content script 会跨 service worker 生命周期保留，启动时必须按当前设置重新校准注册状态。
	void initializeSettings().catch((error) => {
		console.warn("[poe2-extensions] 设置初始化失败", error);
	});
	// 子模块通过 getter 读取父模块状态，避免反向导入 tradeBackground 形成循环依赖。
	tradeStatPresetBackground.install(getStatPresetEnabled);
}

async function initializeSettings(): Promise<void> {
	try {
		const snapshot = await settingsBackground.get(tradeSettings.translate);
		await queueTranslateInjectionSync(snapshot.value);
	} catch (error) {
		console.warn("[poe2-extensions] 翻译脚本注册初始化失败", error);
	}
}

async function setTranslateEnabled(enabled: boolean): Promise<void> {
	await settingsBackground.set(tradeSettings.translate, enabled);
	await queueTranslateInjectionSync(enabled);
}

async function setItemCopyEnabled(enabled: boolean): Promise<void> {
	await settingsBackground.set(tradeSettings.itemCopy, enabled);
}

async function setStatPresetEnabled(enabled: boolean): Promise<void> {
	await settingsBackground.set(tradeSettings.statPreset, enabled);
}

async function getStatPresetEnabled(): Promise<boolean> {
	try {
		return (await settingsBackground.get(tradeSettings.statPreset)).value;
	} catch (error) {
		console.warn("[poe2-extensions] 筛选预设保存设置读取失败", error);
		return tradeSettings.statPreset.defaultValue;
	}
}

function queueTranslateInjectionSync(enabled: boolean): Promise<void> {
	translateInjectionSyncPromise = translateInjectionSyncPromise
		.catch(() => undefined)
		.then(async () => {
			if (lastSyncedTranslateEnabled === enabled) return;
			await syncTradeTranslateInjection(enabled);
			lastSyncedTranslateEnabled = enabled;
		});
	return translateInjectionSyncPromise;
}

async function syncTradeTranslateInjection(enabled: boolean): Promise<void> {
	if (!CHROME) {
		console.warn("[poe2-extensions] 当前浏览器不支持动态注册翻译脚本");
		return;
	}

	const registeredScripts = await chrome.scripting.getRegisteredContentScripts({
		ids: [tradeTranslateContentScriptId],
	});
	if (registeredScripts.length > 0) {
		await chrome.scripting.unregisterContentScripts({ ids: [tradeTranslateContentScriptId] });
	}

	if (!enabled) return;
	await chrome.scripting.registerContentScripts([
		{
			id: tradeTranslateContentScriptId,
			matches: ["https://www.pathofexile.com/trade2*"],
			js: [tradeTranslateContentScriptPath.slice(0, -".ts".length) + ".js"],
			runAt: "document_start",
			world: "MAIN",
			allFrames: false,
			persistAcrossSessions: true,
		},
	]);
}

/**
 * 协调 trade 功能设置副作用、动态翻译脚本注册和活动页面通知的 background 单例。
 */
export const tradeBackground = {
	install,
	getStatPresetEnabled,
	setTranslateEnabled,
	setItemCopyEnabled,
	setStatPresetEnabled,
};
