import type { TradeDataKind } from "./trade-api-types";

export {
	type FilterConfig,
	type TradeFiltersDataResponse,
	type TradeFiltersGroup,
	type TradeItemBaseConfig,
	type TradeItemConfig,
	type TradeItemsDataResponse,
	type TradeItemsGroup,
	type TradeItemUniqueConfig,
	type TradeStatConfig,
	type TradeStaticConfig,
	type TradeStaticsDataResponse,
	type TradeStaticsGroup,
	type TradeStatsGroup,
	type TradeStatsResponse,
} from "./trade-api-types";

export { isUniqueItem } from "./trade-item-utils";

const defaultTradeDataUserAgent =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0";

/**
 * 拉取指定站点的官方 trade2 数据；泛型只描述调用方预期结构，结构校验由具体处理流程负责。
 */
export async function fetchPoe2TradeData<T>(href: string, type: TradeDataKind): Promise<T> {
	const response = await fetch(`https://${href}/api/trade2/data/${type}`, {
		headers: {
			"user-agent": defaultTradeDataUserAgent,
		},
	});
	if (!response.ok) {
		throw new Error(`拉取 trade ${type} 数据失败：${href} ${response.status} ${response.statusText}`);
	}
	return (await response.json()) as T;
}
