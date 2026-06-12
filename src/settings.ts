export const tradeTranslateEnabledKey = 'tradeTranslateEnabled';
export const defaultTradeTranslateEnabled = false;
export const tradeItemCopyEnabledKey = 'tradeItemCopyEnabled';
export const defaultTradeItemCopyEnabled = false;
export const tradeStatPresetEnabledKey = 'tradeStatPresetEnabled';
export const defaultTradeStatPresetEnabled = false;
export const tradeBookmarkFolderIdKey = 'tradeBookmarkFolderId';
export const tradeBookmarkFolderPathKey = 'tradeBookmarkFolderPath';

const settingsStorage = browser.storage.sync;
const localSettingsStorage = browser.storage.local;

export async function getTradeTranslateEnabled(): Promise<boolean> {
	try {
		const values = await settingsStorage.get(tradeTranslateEnabledKey);
		const value = values[tradeTranslateEnabledKey];

		return typeof value === 'boolean' ? value : defaultTradeTranslateEnabled;
	} catch (error) {
		console.warn('[poe2-extensions] 中文翻译设置读取失败', error);
		return defaultTradeTranslateEnabled;
	}
}

export async function getTradeItemCopyEnabled(): Promise<boolean> {
	try {
		const values = await settingsStorage.get(tradeItemCopyEnabledKey);
		const value = values[tradeItemCopyEnabledKey];

		return typeof value === 'boolean' ? value : defaultTradeItemCopyEnabled;
	} catch (error) {
		console.warn('[poe2-extensions] 复制物品文本设置读取失败', error);
		return defaultTradeItemCopyEnabled;
	}
}

export async function getTradeStatPresetEnabled(): Promise<boolean> {
	try {
		const values = await settingsStorage.get(tradeStatPresetEnabledKey);
		const value = values[tradeStatPresetEnabledKey];

		return typeof value === 'boolean' ? value : defaultTradeStatPresetEnabled;
	} catch (error) {
		console.warn('[poe2-extensions] 筛选预设保存设置读取失败', error);
		return defaultTradeStatPresetEnabled;
	}
}

export async function setTradeItemCopyEnabled(enabled: boolean): Promise<void> {
	try {
		await settingsStorage.set({
			[tradeItemCopyEnabledKey]: enabled,
		});
	} catch (error) {
		console.warn('[poe2-extensions] 复制物品文本设置写入失败', error);
		throw error;
	}
}

export async function setTradeStatPresetEnabled(enabled: boolean): Promise<void> {
	try {
		await settingsStorage.set({
			[tradeStatPresetEnabledKey]: enabled,
		});
	} catch (error) {
		console.warn('[poe2-extensions] 筛选预设保存设置写入失败', error);
		throw error;
	}
}

export async function setTradeTranslateEnabled(enabled: boolean): Promise<void> {
	try {
		await settingsStorage.set({
			[tradeTranslateEnabledKey]: enabled,
		});
	} catch (error) {
		console.warn('[poe2-extensions] 中文翻译设置写入失败', error);
		throw error;
	}
}

export async function getTradeBookmarkFolderId(): Promise<string | null> {
	try {
		const values = await localSettingsStorage.get(tradeBookmarkFolderIdKey);
		const value = values[tradeBookmarkFolderIdKey];

		return typeof value === 'string' ? value : null;
	} catch (error) {
		console.warn('[poe2-extensions] trade 书签目录 ID 读取失败', error);
		return null;
	}
}

export async function setTradeBookmarkFolderId(folderId: string): Promise<void> {
	try {
		await localSettingsStorage.set({
			[tradeBookmarkFolderIdKey]: folderId,
		});
	} catch (error) {
		console.warn('[poe2-extensions] trade 书签目录 ID 写入失败', error);
		throw error;
	}
}

export async function clearTradeBookmarkFolderId(): Promise<void> {
	try {
		await localSettingsStorage.remove(tradeBookmarkFolderIdKey);
	} catch (error) {
		console.warn('[poe2-extensions] trade 书签目录 ID 清理失败', error);
	}
}

export async function getTradeBookmarkFolderPath(): Promise<string[] | null> {
	try {
		const values = await settingsStorage.get(tradeBookmarkFolderPathKey);
		const value = values[tradeBookmarkFolderPathKey];

		return isStringArray(value) ? value : null;
	} catch (error) {
		console.warn('[poe2-extensions] trade 书签目录路径读取失败', error);
		return null;
	}
}

export async function setTradeBookmarkFolderPath(path: string[]): Promise<void> {
	try {
		await settingsStorage.set({
			[tradeBookmarkFolderPathKey]: path,
		});
	} catch (error) {
		console.warn('[poe2-extensions] trade 书签目录路径写入失败', error);
		throw error;
	}
}

function isStringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string');
}
