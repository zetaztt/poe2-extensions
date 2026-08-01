import { dictionaryIpcProtocol, type TranslateDictionary } from "@poe2-extensions/core/dictionary";
import { ipcMain } from "../../inject-ipc-channels";

let dictionary: TranslateDictionary | null = null;
let dictionaryPromise: Promise<TranslateDictionary> | null = null;

/**
 * MAIN world 的普通字典加载器；缓存成功结果并合并并发请求，不保存响应式状态。
 */
export const tradeTranslateDictionaryLoader = {
	loadDictionary,
	loadDictionarySafely,
	preloadDictionary,
};

function loadDictionary(): Promise<TranslateDictionary> {
	if (dictionary) return Promise.resolve(dictionary);
	if (dictionaryPromise) return dictionaryPromise;

	dictionaryPromise = ipcMain
		.invoke(dictionaryIpcProtocol.load)
		.then((value) => {
			dictionary = value;
			return value;
		})
		.finally(() => {
			dictionaryPromise = null;
		});

	return dictionaryPromise;
}

async function loadDictionarySafely(): Promise<TranslateDictionary | null> {
	try {
		return await loadDictionary();
	} catch (error) {
		console.error("[poe2-extensions] 翻译字典加载异常", error);
		return null;
	}
}

function preloadDictionary(): void {
	// MAIN world 会提前触发加载；这里必须消费失败，避免预加载产生未处理的 Promise rejection。
	void loadDictionarySafely();
}
