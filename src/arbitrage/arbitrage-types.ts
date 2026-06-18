export interface ArbitrageCurrency {
	id: string;
	name: string;
	symbol: string;
}

export interface ArbitrageProduct {
	id: string;
	name: string;
}

export interface CurrencyExchangeQuote {
	id: string;
	sourceCurrencyId: string;
	sourceAmount: number;
	targetCurrencyId: string;
	targetAmount: number;
}

export interface ProductPriceQuote {
	id: string;
	productId: string;
	currencyId: string;
	buyPrice: number | null;
	sellPrice: number | null;
}

export type OpportunitySort = "order" | "profit" | "return";

export interface ArbitrageState {
	currencies: ArbitrageCurrency[];
	products: ArbitrageProduct[];
	exchangeQuotes: CurrencyExchangeQuote[];
	productQuotes: ProductPriceQuote[];
	minimumProfitByCurrency: Record<string, number>;
	minimumReturnPercent: number;
	showOnlyQualified: boolean;
	sort: OpportunitySort;
}

export interface ArbitrageOpportunity {
	id: string;
	type: "currency" | "product";
	title: string;
	description: string;
	buyCurrencyId: string;
	buyAmount: number;
	finalAmount: number;
	profit: number;
	returnPercent: number;
	qualified: boolean;
	order: number;
}

export interface MissingExchangeOpportunity {
	id: string;
	productName: string;
	buyCurrencyId: string;
	sellCurrencyId: string;
}
