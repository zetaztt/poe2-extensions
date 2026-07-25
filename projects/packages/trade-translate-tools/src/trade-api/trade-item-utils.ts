import type { TradeItemConfig, TradeItemUniqueConfig } from "./trade-api-types";

export function isUniqueItem(item: TradeItemConfig): item is TradeItemUniqueConfig {
	return Boolean("flags" in item && item.flags.unique);
}
