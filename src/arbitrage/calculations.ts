import type {
	ArbitrageOpportunity,
	ArbitrageState,
	CurrencyExchangeQuote,
	MissingExchangeOpportunity,
	OpportunitySort,
} from './types';

export interface ArbitrageCalculationResult {
	opportunities: ArbitrageOpportunity[];
	missingExchanges: MissingExchangeOpportunity[];
}

export function calculateArbitrageOpportunities(state: ArbitrageState): ArbitrageCalculationResult {
	const currencyNames = new Map(state.currencies.map((currency) => [currency.id, currency.symbol]));
	const opportunities: ArbitrageOpportunity[] = [];
	const missingExchanges = new Map<string, MissingExchangeOpportunity>();
	let order = 0;

	for (const outgoing of state.exchangeQuotes) {
		for (const returning of state.exchangeQuotes) {
			if (
				outgoing.sourceCurrencyId !== returning.targetCurrencyId
				|| outgoing.targetCurrencyId !== returning.sourceCurrencyId
			) continue;

			const finalAmount = outgoing.targetAmount * returning.targetAmount / returning.sourceAmount;
			const sourceSymbol = currencyNames.get(outgoing.sourceCurrencyId) ?? '?';
			const targetSymbol = currencyNames.get(outgoing.targetCurrencyId) ?? '?';
			opportunities.push(createOpportunity({
				id: `currency:${outgoing.id}:${returning.id}`,
				type: 'currency',
				title: `${sourceSymbol} → ${targetSymbol} → ${sourceSymbol}`,
				description: `使用 ${formatNumber(outgoing.sourceAmount)}${sourceSymbol} 买入 ${formatNumber(outgoing.targetAmount)}${targetSymbol}，再卖回 ${formatNumber(finalAmount)}${sourceSymbol}`,
				buyCurrencyId: outgoing.sourceCurrencyId,
				buyAmount: outgoing.sourceAmount,
				finalAmount,
				order: order++,
			}, state));
		}
	}

	for (const product of state.products) {
		const quotes = state.productQuotes.filter((quote) => quote.productId === product.id);

		for (const buyQuote of quotes) {
			if (buyQuote.buyPrice === null) continue;

			for (const sellQuote of quotes) {
				if (sellQuote.sellPrice === null) continue;

				const buySymbol = currencyNames.get(buyQuote.currencyId) ?? '?';
				const sellSymbol = currencyNames.get(sellQuote.currencyId) ?? '?';
				let finalAmount: number;
				let exchangeDescription = '';

				if (buyQuote.currencyId === sellQuote.currencyId) {
					finalAmount = sellQuote.sellPrice;
				} else {
					const exchanges = findDirectExchanges(
						state.exchangeQuotes,
						sellQuote.currencyId,
						buyQuote.currencyId,
					);
					if (exchanges.length === 0) {
						const id = `${product.id}:${buyQuote.currencyId}:${sellQuote.currencyId}`;
						missingExchanges.set(id, {
							id,
							productName: product.name,
							buyCurrencyId: buyQuote.currencyId,
							sellCurrencyId: sellQuote.currencyId,
						});
						continue;
					}

					for (const exchange of exchanges) {
						finalAmount = sellQuote.sellPrice * exchange.targetAmount / exchange.sourceAmount;
						exchangeDescription = `，折回 ${formatNumber(finalAmount)}${buySymbol}`;
						opportunities.push(createOpportunity({
							id: `product:${buyQuote.id}:${sellQuote.id}:${exchange.id}`,
							type: 'product',
							title: product.name,
							description: `${formatNumber(buyQuote.buyPrice)}${buySymbol} 买入，${formatNumber(sellQuote.sellPrice)}${sellSymbol} 卖出${exchangeDescription}`,
							buyCurrencyId: buyQuote.currencyId,
							buyAmount: buyQuote.buyPrice,
							finalAmount,
							order: order++,
						}, state));
					}
					continue;
				}

				opportunities.push(createOpportunity({
					id: `product:${buyQuote.id}:${sellQuote.id}:same`,
					type: 'product',
					title: product.name,
					description: `${formatNumber(buyQuote.buyPrice)}${buySymbol} 买入，${formatNumber(sellQuote.sellPrice)}${sellSymbol} 卖出`,
					buyCurrencyId: buyQuote.currencyId,
					buyAmount: buyQuote.buyPrice,
					finalAmount,
					order: order++,
				}, state));
			}
		}
	}

	return {
		opportunities,
		missingExchanges: [...missingExchanges.values()],
	};
}

export function sortArbitrageOpportunities(
	opportunities: ArbitrageOpportunity[],
	sort: OpportunitySort,
): ArbitrageOpportunity[] {
	return [...opportunities].sort((left, right) => {
		if (sort === 'order') return left.order - right.order;
		if (sort === 'return') return right.returnPercent - left.returnPercent || left.order - right.order;
		if (left.buyCurrencyId === right.buyCurrencyId) return right.profit - left.profit || left.order - right.order;
		return right.returnPercent - left.returnPercent || left.order - right.order;
	});
}

function createOpportunity(
	input: Omit<ArbitrageOpportunity, 'profit' | 'returnPercent' | 'qualified'>,
	state: ArbitrageState,
): ArbitrageOpportunity {
	const profit = input.finalAmount - input.buyAmount;
	const returnPercent = profit / input.buyAmount * 100;
	const minimumProfit = state.minimumProfitByCurrency[input.buyCurrencyId] ?? 0;

	return {
		...input,
		profit,
		returnPercent,
		qualified: profit >= minimumProfit && returnPercent >= state.minimumReturnPercent,
	};
}

function findDirectExchanges(
	quotes: CurrencyExchangeQuote[],
	sourceCurrencyId: string,
	targetCurrencyId: string,
): CurrencyExchangeQuote[] {
	return quotes.filter((quote) => (
		quote.sourceCurrencyId === sourceCurrencyId
		&& quote.targetCurrencyId === targetCurrencyId
	));
}

export function formatNumber(value: number): string {
	return new Intl.NumberFormat('zh-CN', {
		maximumFractionDigits: 4,
	}).format(value);
}
