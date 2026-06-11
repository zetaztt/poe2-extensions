export const tradeTranslateEnabledKey = 'tradeTranslateEnabled';
export const defaultTradeTranslateEnabled = false;

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
