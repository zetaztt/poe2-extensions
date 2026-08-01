/**
 * 以可见英文原文为 key 的普通翻译映射，可安全跨 IPC 传输。
 */
export type TranslateDictionary = Record<string, string>;

export interface DictionarySearchResult {
	original: string;
	translated: string;
}
