export const tradeTranslateEnabledKey = 'tradeTranslateEnabled';
export const defaultTradeTranslateEnabled = false;
export const tradeItemCopyEnabledKey = 'tradeItemCopyEnabled';
export const defaultTradeItemCopyEnabled = false;

export async function getTradeTranslateEnabled(): Promise<boolean> {
	try {
		const values = await browser.storage.local.get(tradeTranslateEnabledKey);
		const value = values[tradeTranslateEnabledKey];

		return typeof value === 'boolean' ? value : defaultTradeTranslateEnabled;
	} catch (error) {
		console.warn('[poe2-extensions] 中文翻译设置读取失败', error);
		return defaultTradeTranslateEnabled;
	}
}

export async function getTradeItemCopyEnabled(): Promise<boolean> {
	try {
		const values = await browser.storage.local.get(tradeItemCopyEnabledKey);
		const value = values[tradeItemCopyEnabledKey];

		return typeof value === 'boolean' ? value : defaultTradeItemCopyEnabled;
	} catch (error) {
		console.warn('[poe2-extensions] 复制物品文本设置读取失败', error);
		return defaultTradeItemCopyEnabled;
	}
}

export async function setTradeItemCopyEnabled(enabled: boolean): Promise<void> {
	try {
		await browser.storage.local.set({
			[tradeItemCopyEnabledKey]: enabled,
		});
	} catch (error) {
		console.warn('[poe2-extensions] 复制物品文本设置写入失败', error);
		throw error;
	}
}

export async function setTradeTranslateEnabled(enabled: boolean): Promise<void> {
	try {
		await browser.storage.local.set({
			[tradeTranslateEnabledKey]: enabled,
		});
	} catch (error) {
		console.warn('[poe2-extensions] 中文翻译设置写入失败', error);
		throw error;
	}
}
