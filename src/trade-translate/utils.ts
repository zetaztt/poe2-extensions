import { TradeItemConfig, TradeItemUniqueConfig, type TradeSearchItem } from "./types";

export const logPrefix = '[poe2-extensions][translate]';

export function isUniqueItem(item: TradeItemConfig): item is TradeItemUniqueConfig {
	return Boolean('flags' in item && item.flags.unique);
}

export function getTradeSearchItemById(itemId: string): TradeSearchItem | undefined {
	const searches = window.app?.$store.state.transient.searches;
	if (!searches) return undefined;

	for (const search of searches) {
		for (const result of search.results) {
			const entry = result.items[itemId];
			if (entry) return entry.item;
		}
	}

	return undefined;
}
