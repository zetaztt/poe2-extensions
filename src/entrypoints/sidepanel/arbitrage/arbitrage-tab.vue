<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from "vue";
import { calculateArbitrageOpportunities, formatNumber, sortArbitrageOpportunities } from "@/arbitrage/calculations";
import { createEmptyArbitrageState, loadArbitrageState, saveArbitrageState } from "@/arbitrage/storage";
import type {
	ArbitrageCurrency,
	ArbitrageProduct,
	ArbitrageState,
	CurrencyExchangeQuote,
	ProductPriceQuote,
} from "@/arbitrage/types";

const state = reactive<ArbitrageState>(createEmptyArbitrageState());
const isLoading = ref(true);
const statusText = ref("");
const expandedQuoteIds = ref(new Set<string>());

const newCurrencyName = ref("");
const newCurrencySymbol = ref("");
const newProductName = ref("");
const exchangeSourceCurrencyId = ref("");
const exchangeSourceAmount = ref<number | null>(null);
const exchangeTargetCurrencyId = ref("");
const exchangeTargetAmount = ref<number | null>(null);
const quoteProductId = ref("");
const quoteCurrencyId = ref("");
const quotePrice = ref<number | null>(null);

const calculation = computed(() => calculateArbitrageOpportunities(state));
const visibleOpportunities = computed(() => {
	const opportunities = state.showOnlyQualified
		? calculation.value.opportunities.filter((opportunity) => opportunity.qualified)
		: calculation.value.opportunities;
	return sortArbitrageOpportunities(opportunities, state.sort);
});

onMounted(async () => {
	Object.assign(state, await loadArbitrageState());
	expandedQuoteIds.value = new Set(
		state.productQuotes.filter((quote) => quote.buyPrice !== quote.sellPrice).map((quote) => quote.id),
	);
	syncDraftSelections();
	isLoading.value = false;
});

function addCurrency(): void {
	const name = newCurrencyName.value.trim();
	const symbol = newCurrencySymbol.value.trim();
	if (!name || !symbol) {
		showStatus("请填写货币名称和简称。");
		return;
	}
	if (state.currencies.some((currency) => currency.symbol.toLocaleLowerCase() === symbol.toLocaleLowerCase())) {
		showStatus("货币简称不能重复。");
		return;
	}

	state.currencies.push({ id: createId("currency"), name, symbol });
	newCurrencyName.value = "";
	newCurrencySymbol.value = "";
	syncDraftSelections();
	void persist("货币已添加。");
}

function addProduct(): void {
	const name = newProductName.value.trim();
	if (!name) {
		showStatus("请填写商品名称。");
		return;
	}

	state.products.push({ id: createId("product"), name });
	newProductName.value = "";
	syncDraftSelections();
	void persist("商品已添加。");
}

function updateCurrency(currency: ArbitrageCurrency, field: "name" | "symbol", event: Event): void {
	const value = getInputValue(event).trim();
	if (!value) return;
	if (
		field === "symbol"
		&& state.currencies.some(
			(item) => item.id !== currency.id && item.symbol.toLocaleLowerCase() === value.toLocaleLowerCase(),
		)
	) {
		showStatus("货币简称不能重复。");
		return;
	}

	currency[field] = value;
	void persist();
}

function updateProduct(product: ArbitrageProduct, event: Event): void {
	const value = getInputValue(event).trim();
	if (!value) return;
	product.name = value;
	void persist();
}

function deleteCurrency(currency: ArbitrageCurrency): void {
	if (!window.confirm(`确定删除货币“${currency.name}（${currency.symbol}）”及其全部关联报价吗？`)) return;

	state.currencies = state.currencies.filter((item) => item.id !== currency.id);
	state.exchangeQuotes = state.exchangeQuotes.filter(
		(quote) => quote.sourceCurrencyId !== currency.id && quote.targetCurrencyId !== currency.id,
	);
	state.productQuotes = state.productQuotes.filter((quote) => quote.currencyId !== currency.id);
	delete state.minimumProfitByCurrency[currency.id];
	syncDraftSelections();
	void persist("货币及关联报价已删除。");
}

function deleteProduct(product: ArbitrageProduct): void {
	if (!window.confirm(`确定删除商品“${product.name}”及其全部报价吗？`)) return;

	state.products = state.products.filter((item) => item.id !== product.id);
	state.productQuotes = state.productQuotes.filter((quote) => quote.productId !== product.id);
	syncDraftSelections();
	void persist("商品及关联报价已删除。");
}

function addExchangeQuote(): void {
	if (
		!exchangeSourceCurrencyId.value
		|| !exchangeTargetCurrencyId.value
		|| exchangeSourceCurrencyId.value === exchangeTargetCurrencyId.value
		|| !isPositiveNumber(exchangeSourceAmount.value)
		|| !isPositiveNumber(exchangeTargetAmount.value)
	) {
		showStatus("请选择两种不同货币，并填写有效的兑换数量。");
		return;
	}

	state.exchangeQuotes.push({
		id: createId("exchange"),
		sourceCurrencyId: exchangeSourceCurrencyId.value,
		sourceAmount: exchangeSourceAmount.value,
		targetCurrencyId: exchangeTargetCurrencyId.value,
		targetAmount: exchangeTargetAmount.value,
	});
	exchangeSourceAmount.value = null;
	exchangeTargetAmount.value = null;
	void persist("兑换报价已添加。");
}

function updateExchangeAmount(
	quote: CurrencyExchangeQuote,
	field: "sourceAmount" | "targetAmount",
	event: Event,
): void {
	const value = parsePositiveInput(event);
	if (value === null) return;
	quote[field] = value;
	void persist();
}

function updateExchangeCurrency(
	quote: CurrencyExchangeQuote,
	field: "sourceCurrencyId" | "targetCurrencyId",
	event: Event,
): void {
	const value = getInputValue(event);
	const other = field === "sourceCurrencyId" ? quote.targetCurrencyId : quote.sourceCurrencyId;
	if (!value || value === other) {
		showStatus("兑换报价必须选择两种不同货币。");
		return;
	}
	quote[field] = value;
	void persist();
}

function deleteExchangeQuote(id: string): void {
	state.exchangeQuotes = state.exchangeQuotes.filter((quote) => quote.id !== id);
	void persist();
}

function addProductQuote(): void {
	if (!quoteProductId.value || !quoteCurrencyId.value || !isPositiveNumber(quotePrice.value)) {
		showStatus("请选择商品和货币，并填写有效价格。");
		return;
	}
	if (
		state.productQuotes.some(
			(quote) => quote.productId === quoteProductId.value && quote.currencyId === quoteCurrencyId.value,
		)
	) {
		showStatus("该商品已经存在此货币报价，可直接编辑。");
		return;
	}

	state.productQuotes.push({
		id: createId("price"),
		productId: quoteProductId.value,
		currencyId: quoteCurrencyId.value,
		buyPrice: quotePrice.value,
		sellPrice: quotePrice.value,
	});
	quotePrice.value = null;
	void persist("商品报价已添加。");
}

function updateUnifiedPrice(quote: ProductPriceQuote, event: Event): void {
	const value = parsePositiveInput(event);
	if (value === null) return;
	quote.buyPrice = value;
	quote.sellPrice = value;
	void persist();
}

function updateSplitPrice(quote: ProductPriceQuote, field: "buyPrice" | "sellPrice", event: Event): void {
	const value = parsePositiveInput(event);
	if (value === null) return;
	quote[field] = value;
	void persist();
}

function toggleProductQuote(quote: ProductPriceQuote): void {
	const next = new Set(expandedQuoteIds.value);
	if (next.has(quote.id)) {
		next.delete(quote.id);
		quote.sellPrice = quote.buyPrice;
		void persist();
	} else {
		next.add(quote.id);
		quote.sellPrice = quote.buyPrice;
	}
	expandedQuoteIds.value = next;
}

function deleteProductQuote(id: string): void {
	state.productQuotes = state.productQuotes.filter((quote) => quote.id !== id);
	const next = new Set(expandedQuoteIds.value);
	next.delete(id);
	expandedQuoteIds.value = next;
	void persist();
}

function updateMinimumProfit(currencyId: string, event: Event): void {
	const value = parseNonNegativeInput(event);
	if (value === null) return;
	state.minimumProfitByCurrency[currencyId] = value;
	void persist();
}

function updateMinimumReturn(event: Event): void {
	const value = parseNonNegativeInput(event);
	if (value === null) return;
	state.minimumReturnPercent = value;
	void persist();
}

function updateShowOnlyQualified(event: Event): void {
	state.showOnlyQualified = (event.target as HTMLInputElement).checked;
	void persist();
}

function updateSort(event: Event): void {
	const value = getInputValue(event);
	if (value !== "order" && value !== "profit" && value !== "return") return;
	state.sort = value;
	void persist();
}

function getCurrencySymbol(currencyId: string): string {
	return state.currencies.find((currency) => currency.id === currencyId)?.symbol ?? "?";
}

function getProductName(productId: string): string {
	return state.products.find((product) => product.id === productId)?.name ?? "未知商品";
}

function isExpanded(quoteId: string): boolean {
	return expandedQuoteIds.value.has(quoteId);
}

async function persist(message = ""): Promise<void> {
	try {
		await saveArbitrageState({
			currencies: state.currencies,
			products: state.products,
			exchangeQuotes: state.exchangeQuotes,
			productQuotes: state.productQuotes,
			minimumProfitByCurrency: state.minimumProfitByCurrency,
			minimumReturnPercent: state.minimumReturnPercent,
			showOnlyQualified: state.showOnlyQualified,
			sort: state.sort,
		});
		if (message) showStatus(message);
	} catch (error) {
		showStatus("本地保存失败，请稍后重试。");
		console.error("[poe2-extensions] 倒卖差价数据保存失败", error);
	}
}

function syncDraftSelections(): void {
	const firstCurrencyId = state.currencies[0]?.id ?? "";
	const secondCurrencyId = state.currencies.find((currency) => currency.id !== firstCurrencyId)?.id ?? "";
	if (!state.currencies.some((currency) => currency.id === exchangeSourceCurrencyId.value)) {
		exchangeSourceCurrencyId.value = firstCurrencyId;
	}
	if (
		!state.currencies.some((currency) => currency.id === exchangeTargetCurrencyId.value)
		|| exchangeTargetCurrencyId.value === exchangeSourceCurrencyId.value
	) {
		exchangeTargetCurrencyId.value = secondCurrencyId;
	}
	if (!state.currencies.some((currency) => currency.id === quoteCurrencyId.value)) {
		quoteCurrencyId.value = firstCurrencyId;
	}
	if (!state.products.some((product) => product.id === quoteProductId.value)) {
		quoteProductId.value = state.products[0]?.id ?? "";
	}
}

function showStatus(message: string): void {
	statusText.value = message;
}

function createId(prefix: string): string {
	return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getInputValue(event: Event): string {
	return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

function parsePositiveInput(event: Event): number | null {
	const value = Number(getInputValue(event));
	return isPositiveNumber(value) ? value : null;
}

function parseNonNegativeInput(event: Event): number | null {
	const value = Number(getInputValue(event));
	return Number.isFinite(value) && value >= 0 ? value : null;
}

function isPositiveNumber(value: number | null): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0;
}
</script>

<template>
	<section class="arbitrage-tab">
		<div v-if="isLoading" class="panel muted">读取倒卖数据中...</div>

		<template v-else>
			<section class="panel">
				<div class="section-heading">
					<div>
						<h2>资产管理</h2>
						<p>先添加交易中使用的货币和商品。</p>
					</div>
				</div>

				<form class="add-row" @submit.prevent="addCurrency">
					<input v-model="newCurrencyName" type="text" placeholder="货币名称，如崇高石" />
					<input v-model="newCurrencySymbol" type="text" placeholder="简称，如 e" />
					<button type="submit">添加货币</button>
				</form>
				<div class="asset-list">
					<div v-for="currency in state.currencies" :key="currency.id" class="asset-row">
						<input
							:value="currency.name"
							aria-label="货币名称"
							@change="updateCurrency(currency, 'name', $event)" />
						<input
							:value="currency.symbol"
							aria-label="货币简称"
							@change="updateCurrency(currency, 'symbol', $event)" />
						<button class="danger-button" type="button" @click="deleteCurrency(currency)">删除</button>
					</div>
				</div>

				<form class="add-row product-add" @submit.prevent="addProduct">
					<input v-model="newProductName" type="text" placeholder="商品名称" />
					<button type="submit">添加商品</button>
				</form>
				<div class="asset-list">
					<div v-for="product in state.products" :key="product.id" class="asset-row product-row">
						<input :value="product.name" aria-label="商品名称" @change="updateProduct(product, $event)" />
						<button class="danger-button" type="button" @click="deleteProduct(product)">删除</button>
					</div>
				</div>
			</section>

			<section class="panel">
				<div class="section-heading">
					<div>
						<h2>货币兑换报价</h2>
						<p>每个方向单独录入，例如 100e → 1d。</p>
					</div>
				</div>

				<form class="exchange-form" @submit.prevent="addExchangeQuote">
					<input v-model.number="exchangeSourceAmount" type="number" min="0" step="any" placeholder="数量" />
					<select v-model="exchangeSourceCurrencyId" aria-label="来源货币">
						<option value="" disabled>来源货币</option>
						<option v-for="currency in state.currencies" :key="currency.id" :value="currency.id">
							{{ currency.symbol }}
						</option>
					</select>
					<span>→</span>
					<input v-model.number="exchangeTargetAmount" type="number" min="0" step="any" placeholder="数量" />
					<select v-model="exchangeTargetCurrencyId" aria-label="目标货币">
						<option value="" disabled>目标货币</option>
						<option v-for="currency in state.currencies" :key="currency.id" :value="currency.id">
							{{ currency.symbol }}
						</option>
					</select>
					<button type="submit">添加</button>
				</form>

				<div class="quote-list">
					<div v-for="quote in state.exchangeQuotes" :key="quote.id" class="exchange-row">
						<input
							:value="quote.sourceAmount"
							type="number"
							min="0"
							step="any"
							@change="updateExchangeAmount(quote, 'sourceAmount', $event)" />
						<select
							:value="quote.sourceCurrencyId"
							@change="updateExchangeCurrency(quote, 'sourceCurrencyId', $event)">
							<option v-for="currency in state.currencies" :key="currency.id" :value="currency.id">
								{{ currency.symbol }}
							</option>
						</select>
						<span>→</span>
						<input
							:value="quote.targetAmount"
							type="number"
							min="0"
							step="any"
							@change="updateExchangeAmount(quote, 'targetAmount', $event)" />
						<select
							:value="quote.targetCurrencyId"
							@change="updateExchangeCurrency(quote, 'targetCurrencyId', $event)">
							<option v-for="currency in state.currencies" :key="currency.id" :value="currency.id">
								{{ currency.symbol }}
							</option>
						</select>
						<button
							class="icon-button"
							type="button"
							title="删除报价"
							@click="deleteExchangeQuote(quote.id)">
							×
						</button>
					</div>
				</div>
			</section>

			<section class="panel">
				<div class="section-heading">
					<div>
						<h2>商品报价</h2>
						<p>默认买卖同价，展开后可分别填写。</p>
					</div>
				</div>

				<form class="product-quote-form" @submit.prevent="addProductQuote">
					<select v-model="quoteProductId">
						<option value="" disabled>选择商品</option>
						<option v-for="product in state.products" :key="product.id" :value="product.id">
							{{ product.name }}
						</option>
					</select>
					<input v-model.number="quotePrice" type="number" min="0" step="any" placeholder="价格" />
					<select v-model="quoteCurrencyId">
						<option value="" disabled>货币</option>
						<option v-for="currency in state.currencies" :key="currency.id" :value="currency.id">
							{{ currency.symbol }}
						</option>
					</select>
					<button type="submit">添加</button>
				</form>

				<div class="quote-list">
					<article v-for="quote in state.productQuotes" :key="quote.id" class="product-quote">
						<div class="product-quote-heading">
							<strong>{{ getProductName(quote.productId) }}</strong>
							<span>{{ getCurrencySymbol(quote.currencyId) }}</span>
							<button type="button" class="link-button" @click="toggleProductQuote(quote)">
								{{ isExpanded(quote.id) ? "收起" : "展开买卖价" }}
							</button>
							<button
								class="icon-button"
								type="button"
								title="删除报价"
								@click="deleteProductQuote(quote.id)">
								×
							</button>
						</div>
						<label v-if="!isExpanded(quote.id)" class="price-field">
							<span>价格</span>
							<input
								:value="quote.buyPrice ?? ''"
								type="number"
								min="0"
								step="any"
								@change="updateUnifiedPrice(quote, $event)" />
						</label>
						<div v-else class="split-prices">
							<label class="price-field">
								<span>买入价</span>
								<input
									:value="quote.buyPrice ?? ''"
									type="number"
									min="0"
									step="any"
									@change="updateSplitPrice(quote, 'buyPrice', $event)" />
							</label>
							<label class="price-field">
								<span>卖出价</span>
								<input
									:value="quote.sellPrice ?? ''"
									type="number"
									min="0"
									step="any"
									@change="updateSplitPrice(quote, 'sellPrice', $event)" />
							</label>
						</div>
					</article>
				</div>
			</section>

			<section class="panel">
				<div class="section-heading">
					<div>
						<h2>最低利润门槛</h2>
						<p>利润额和收益率需要同时满足。</p>
					</div>
				</div>
				<div class="threshold-grid">
					<label class="price-field">
						<span>最低收益率（%）</span>
						<input
							:value="state.minimumReturnPercent"
							type="number"
							min="0"
							step="any"
							@change="updateMinimumReturn" />
					</label>
					<label v-for="currency in state.currencies" :key="currency.id" class="price-field">
						<span>最低利润（{{ currency.symbol }}）</span>
						<input
							:value="state.minimumProfitByCurrency[currency.id] ?? 0"
							type="number"
							min="0"
							step="any"
							@change="updateMinimumProfit(currency.id, $event)" />
					</label>
				</div>
			</section>

			<section class="panel">
				<div class="section-heading result-heading">
					<div>
						<h2>倒卖机会</h2>
						<p>利润按买入货币计算。</p>
					</div>
					<select :value="state.sort" aria-label="结果排序" @change="updateSort">
						<option value="return">收益率排序</option>
						<option value="profit">利润排序</option>
						<option value="order">录入顺序</option>
					</select>
				</div>
				<label class="filter-toggle">
					<input type="checkbox" :checked="state.showOnlyQualified" @change="updateShowOnlyQualified" />
					仅显示达到利润门槛的机会
				</label>

				<div v-if="visibleOpportunities.length" class="opportunity-list">
					<article
						v-for="opportunity in visibleOpportunities"
						:key="opportunity.id"
						class="opportunity"
						:class="{ qualified: opportunity.qualified, loss: opportunity.profit < 0 }">
						<div class="opportunity-heading">
							<strong>{{ opportunity.title }}</strong>
							<span>{{ opportunity.type === "currency" ? "货币" : "商品" }}</span>
						</div>
						<p>{{ opportunity.description }}</p>
						<div class="result-values">
							<strong>
								{{ opportunity.profit >= 0 ? "+" : "" }}{{ formatNumber(opportunity.profit)
								}}{{ getCurrencySymbol(opportunity.buyCurrencyId) }}
							</strong>
							<span
								>{{ opportunity.returnPercent >= 0 ? "+" : ""
								}}{{ formatNumber(opportunity.returnPercent) }}%</span
							>
							<small>{{ opportunity.qualified ? "已达门槛" : "未达门槛" }}</small>
						</div>
					</article>
				</div>
				<p v-else class="empty-state">暂无符合条件的倒卖机会。</p>

				<div v-if="calculation.missingExchanges.length" class="missing-list">
					<strong>缺少直接兑换报价</strong>
					<p v-for="missing in calculation.missingExchanges" :key="missing.id">
						{{ missing.productName }}：{{ getCurrencySymbol(missing.sellCurrencyId) }} →
						{{ getCurrencySymbol(missing.buyCurrencyId) }}
					</p>
				</div>
			</section>

			<p v-if="statusText" class="status-text" aria-live="polite">{{ statusText }}</p>
		</template>
	</section>
</template>

<style scoped>
.arbitrage-tab,
.quote-list,
.asset-list,
.opportunity-list {
	display: grid;
	gap: 1px;
}

.arbitrage-tab {
	gap: 8px;
	padding: 8px;
	background: #000;
}

.panel {
	padding: 8px;
	border: 0;
	border-radius: 0;
	background: #000;
}

.section-heading,
.product-quote-heading,
.opportunity-heading,
.result-values,
.filter-toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
}

.section-heading {
	min-height: 28px;
	padding: 2px 0 5px;
	border-bottom: 1px solid #4a4a4a;
}

h2,
p {
	margin: 0;
}

h2 {
	color: #e2e2e2;
	font-family: FontinSmallCaps, Verdana, Arial, "Microsoft YaHei", sans-serif;
	font-size: 14px;
	font-weight: 400;
}

.section-heading p,
.opportunity p,
.muted,
.empty-state,
.status-text,
.missing-list {
	color: var(--color-text);
	font-size: 11px;
}

.section-heading p {
	margin-top: 2px;
}

form,
.asset-list,
.quote-list,
.threshold-grid,
.filter-toggle,
.opportunity-list,
.missing-list {
	margin-top: 6px;
}

.add-row,
.exchange-form,
.exchange-row,
.product-quote-form,
.asset-row,
.split-prices,
.threshold-grid {
	display: grid;
	gap: 8px;
}

.add-row {
	grid-template-columns: 1.4fr 0.8fr auto;
}

.product-add,
.product-row {
	grid-template-columns: 1fr auto;
}

.exchange-form,
.exchange-row {
	grid-template-columns: minmax(48px, 0.7fr) minmax(58px, 1fr) auto minmax(48px, 0.7fr) minmax(58px, 1fr) auto;
	align-items: center;
}

.product-quote-form {
	grid-template-columns: 1.4fr 0.8fr 0.7fr auto;
}

.asset-row {
	grid-template-columns: 1.4fr 0.8fr auto;
}

.threshold-grid,
.split-prices {
	grid-template-columns: repeat(2, minmax(0, 1fr));
}

input,
select,
button {
	min-width: 0;
	min-height: var(--control-height);
	border-radius: 0;
	font: inherit;
}

input,
select {
	width: 100%;
	padding: 6px 8px;
	border: 1px solid #000;
	outline: none;
	background: #1e2124;
	box-shadow: var(--shadow-inset);
	color: #e2e2e2;
}

input:focus,
select:focus {
	border-color: #a38d6d;
	box-shadow: var(--shadow-inset);
}

button {
	padding: 0 10px;
	border: 1px solid #444;
	background: #1e2124;
	color: #e2e2e2;
	cursor: pointer;
}

button:hover {
	border-color: #666;
	background: #292d30;
	color: #fff;
}

form button[type="submit"] {
	border-color: var(--color-button-secondary-border);
	background: var(--color-button-secondary);
	color: #fff;
}

form button[type="submit"]:hover {
	border-color: #b17b1c;
	background: #805200;
}

.danger-button,
.icon-button {
	border-color: #4a2b2b;
	background: transparent;
	color: #d20000;
}

.danger-button:hover,
.icon-button:hover {
	border-color: var(--color-danger);
	background: rgb(200 103 110 / 12%);
}

.icon-button {
	width: 34px;
	padding: 0;
	font-size: 20px;
}

.product-quote {
	padding: 8px;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	border-radius: 0;
	background: #101112;
}

.product-quote-heading span,
.opportunity-heading span {
	color: #a38d6d;
	font-size: 11px;
}

.product-quote-heading strong {
	margin-right: auto;
}

.link-button {
	min-height: 28px;
	padding: 0;
	border: 0;
	background: transparent;
	color: #43a2e6;
	font-size: 11px;
}

.link-button:hover {
	background: transparent;
	text-decoration: underline;
}

.price-field {
	display: grid;
	gap: 5px;
	margin-top: 10px;
	color: var(--color-text);
	font-size: 11px;
}

.split-prices .price-field,
.threshold-grid .price-field {
	margin-top: 0;
}

.result-heading select {
	width: auto;
}

.filter-toggle {
	justify-content: flex-start;
	padding: 7px 8px;
	border: 1px solid #000;
	border-left-color: #8a6d3b;
	background: #1e2124;
	color: #e2e2e2;
	font-size: 11px;
}

.filter-toggle input {
	width: 16px;
	min-height: 16px;
}

.opportunity {
	padding: 8px;
	border: 1px solid #000;
	border-left: 3px solid #837053;
	border-radius: 0;
	background: #101112;
}

.opportunity.qualified {
	border-left-color: var(--color-success);
}

.opportunity.loss {
	border-left-color: var(--color-danger);
}

.opportunity p {
	margin-top: 5px;
	line-height: 1.5;
}

.result-values {
	justify-content: flex-start;
	margin-top: 8px;
}

.result-values strong {
	color: #dfcf99;
}

.result-values small {
	margin-left: auto;
	color: var(--color-text);
}

.missing-list {
	padding-top: 10px;
	border-top: 1px solid #333;
}

.missing-list p {
	margin-top: 4px;
}

.empty-state {
	margin-top: 12px;
	text-align: center;
}

.status-text {
	position: sticky;
	bottom: 8px;
	padding: 8px 10px;
	border: 1px solid #8a6d3b;
	border-radius: 0;
	background: rgb(16 17 18 / 96%);
	box-shadow: 0 4px 16px #000;
}

@media (max-width: 500px) {
	.add-row,
	.product-add,
	.product-quote-form,
	.asset-row,
	.product-row {
		grid-template-columns: 1fr;
	}

	.exchange-form,
	.exchange-row {
		grid-template-columns: minmax(52px, 0.7fr) minmax(58px, 1fr) auto;
	}

	.exchange-form button,
	.exchange-row .icon-button {
		grid-column: 1 / -1;
		width: 100%;
	}

	.threshold-grid {
		grid-template-columns: 1fr;
	}

	.result-heading {
		align-items: stretch;
		flex-direction: column;
	}

	.result-heading select {
		width: 100%;
	}
}

@media (max-width: 360px) {
	.exchange-form,
	.exchange-row {
		grid-template-columns: 1fr 1fr;
	}

	.exchange-form > span,
	.exchange-row > span {
		display: none;
	}
}
</style>
