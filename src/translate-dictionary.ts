import { ipcMain } from "./ipc/ipc";
import { logPrefix } from "./trade/trade-utils";
import { tradeIpcProtocol } from "./trade/trade-ipc-protocol";

export type TranslateDictionary = Record<string, string>;

let dictionaryRequestPromise: Promise<TranslateDictionary | null> | null = null;

export function preloadTranslateDictionary(): void {
	void loadTranslateDictionary();
}

export function loadTranslateDictionary(): Promise<TranslateDictionary | null> {
	dictionaryRequestPromise ??= requestTranslateDictionary();
	return dictionaryRequestPromise;
}

async function requestTranslateDictionary(): Promise<TranslateDictionary | null> {
	try {
		return await requestTranslateDictionaryFromBackground();
	} catch (error) {
		console.error(`${logPrefix} 翻译字典加载异常`, error);
		return null;
	}
}

function requestTranslateDictionaryFromBackground(): Promise<TranslateDictionary> {
	return ipcMain.invoke(tradeIpcProtocol.fetchDictionary);
}
