import type {
	ArbitrageCurrency,
	ArbitrageProduct,
	ArbitrageState,
	CurrencyExchangeQuote,
	OpportunitySort,
	ProductPriceQuote,
} from './types';

const storageKey = 'tradeArbitrageState';

export function createEmptyArbitrageState(): ArbitrageState {
	return {
		currencies: [],
		products: [],
		exchangeQuotes: [],
		productQuotes: [],
		minimumProfitByCurrency: {},
		minimumReturnPercent: 0,
		showOnlyQualified: true,
		sort: 'return',
	};
}

export async function loadArbitrageState(): Promise<ArbitrageState> {
	try {
		const values = await browser.storage.local.get(storageKey);
		return parseArbitrageState(values[storageKey]);
	} catch (error) {
		console.warn('[poe2-extensions] 倒卖差价数据读取失败', error);
		return createEmptyArbitrageState();
	}
}

export async function saveArbitrageState(state: ArbitrageState): Promise<void> {
	await browser.storage.local.set({
		[storageKey]: state,
	});
}

function parseArbitrageState(value: unknown): ArbitrageState {
	const fallback = createEmptyArbitrageState();
	if (!isRecord(value)) return fallback;

	const currencies = Array.isArray(value.currencies)
		? value.currencies.filter(isCurrency)
		: [];
	const currencyIds = new Set(currencies.map((currency) => currency.id));
	const products = Array.isArray(value.products)
		? value.products.filter(isProduct)
		: [];
	const productIds = new Set(products.map((product) => product.id));
	const exchangeQuotes = Array.isArray(value.exchangeQuotes)
		? value.exchangeQuotes.filter((quote): quote is CurrencyExchangeQuote => (
			isExchangeQuote(quote)
			&& currencyIds.has(quote.sourceCurrencyId)
			&& currencyIds.has(quote.targetCurrencyId)
		))
		: [];
	const productQuotes = Array.isArray(value.productQuotes)
		? value.productQuotes.filter((quote): quote is ProductPriceQuote => (
			isProductQuote(quote)
			&& productIds.has(quote.productId)
			&& currencyIds.has(quote.currencyId)
		))
		: [];

	return {
		currencies,
		products,
		exchangeQuotes,
		productQuotes,
		minimumProfitByCurrency: parseMinimumProfits(value.minimumProfitByCurrency, currencyIds),
		minimumReturnPercent: isNonNegativeNumber(value.minimumReturnPercent)
			? value.minimumReturnPercent
			: fallback.minimumReturnPercent,
		showOnlyQualified: typeof value.showOnlyQualified === 'boolean'
			? value.showOnlyQualified
			: fallback.showOnlyQualified,
		sort: isOpportunitySort(value.sort) ? value.sort : fallback.sort,
	};
}

function parseMinimumProfits(value: unknown, currencyIds: Set<string>): Record<string, number> {
	if (!isRecord(value)) return {};

	const minimumProfits: Record<string, number> = {};
	for (const [currencyId, amount] of Object.entries(value)) {
		if (currencyIds.has(currencyId) && isNonNegativeNumber(amount)) {
			minimumProfits[currencyId] = amount;
		}
	}
	return minimumProfits;
}

function isCurrency(value: unknown): value is ArbitrageCurrency {
	return isRecord(value)
		&& isNonEmptyString(value.id)
		&& isNonEmptyString(value.name)
		&& isNonEmptyString(value.symbol);
}

function isProduct(value: unknown): value is ArbitrageProduct {
	return isRecord(value)
		&& isNonEmptyString(value.id)
		&& isNonEmptyString(value.name);
}

function isExchangeQuote(value: unknown): value is CurrencyExchangeQuote {
	return isRecord(value)
		&& isNonEmptyString(value.id)
		&& isNonEmptyString(value.sourceCurrencyId)
		&& isPositiveNumber(value.sourceAmount)
		&& isNonEmptyString(value.targetCurrencyId)
		&& isPositiveNumber(value.targetAmount)
		&& value.sourceCurrencyId !== value.targetCurrencyId;
}

function isProductQuote(value: unknown): value is ProductPriceQuote {
	return isRecord(value)
		&& isNonEmptyString(value.id)
		&& isNonEmptyString(value.productId)
		&& isNonEmptyString(value.currencyId)
		&& isNullablePositiveNumber(value.buyPrice)
		&& isNullablePositiveNumber(value.sellPrice);
}

function isOpportunitySort(value: unknown): value is OpportunitySort {
	return value === 'order' || value === 'profit' || value === 'return';
}

function isNullablePositiveNumber(value: unknown): value is number | null {
	return value === null || isPositiveNumber(value);
}

function isPositiveNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
