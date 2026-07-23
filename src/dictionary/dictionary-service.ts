import { ipcMain } from "../ipc/ipc";
import { dictionaryIpcProtocol } from "./dictionary-ipc-protocol";
import type { TranslateDictionary } from "./dictionary-types";

export enum DictionaryServiceEventType {
	Loaded = 1,
	Error = 2,
}

export type DictionaryServiceEvent =
	| { type: DictionaryServiceEventType.Loaded; dictionary: TranslateDictionary }
	| { type: DictionaryServiceEventType.Error; error: unknown };

let currentDictionary: TranslateDictionary | null = null;
let dictionaryPromise: Promise<TranslateDictionary> | null = null;
let dictionaryServiceError: unknown = null;
const listeners = new Set<(event: DictionaryServiceEvent) => void>();

export function getCurrentDictionary(): TranslateDictionary | null {
	return currentDictionary;
}

export function isDictionaryServiceLoading(): boolean {
	return dictionaryPromise !== null;
}

export function getDictionaryServiceError(): unknown {
	return dictionaryServiceError;
}

export function subscribeDictionary(listener: (event: DictionaryServiceEvent) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function loadDictionary(): Promise<TranslateDictionary> {
	if (currentDictionary) return Promise.resolve(currentDictionary);
	if (dictionaryPromise) return dictionaryPromise;

	dictionaryServiceError = null;
	dictionaryPromise = ipcMain
		.invoke(dictionaryIpcProtocol.load)
		.then((dictionary) => {
			currentDictionary = dictionary;
			publishDictionaryEvent({ type: DictionaryServiceEventType.Loaded, dictionary });
			return dictionary;
		})
		.catch((error: unknown) => {
			dictionaryServiceError = error;
			publishDictionaryEvent({ type: DictionaryServiceEventType.Error, error });
			throw error;
		})
		.finally(() => {
			dictionaryPromise = null;
		});
	return dictionaryPromise;
}

export function preloadDictionary(): void {
	// 主世界翻译 hook 会提前触发加载；这里必须消费失败，避免预加载产生未处理的 Promise rejection。
	void loadDictionarySafely();
}

export async function loadDictionarySafely(): Promise<TranslateDictionary | null> {
	try {
		return await loadDictionary();
	} catch (error) {
		console.error("[poe2-extensions] 翻译字典加载异常", error);
		return null;
	}
}

function publishDictionaryEvent(event: DictionaryServiceEvent): void {
	for (const listener of listeners) {
		try {
			listener(event);
		} catch (error) {
			console.error("[poe2-extensions] 翻译字典 service 事件处理失败", error);
		}
	}
}
