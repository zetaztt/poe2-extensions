export const poeTradeMessageSource = 'poe2-extensions:trade';

export const PoeTradeMessageType = {
	featuresUpdate: 'POE_TRADE_FEATURES_UPDATE',
} as const;

export interface TradeFeatures {
	translate: boolean;
	itemCopy: boolean;
}

export type PoeTradeFeaturesUpdateMessage = {
	source: typeof poeTradeMessageSource;
	type: typeof PoeTradeMessageType.featuresUpdate;
	features: TradeFeatures;
};

export type PoeTradeMessage = PoeTradeFeaturesUpdateMessage;

export function createTradeFeaturesUpdateMessage(features: TradeFeatures): PoeTradeFeaturesUpdateMessage {
	return {
		source: poeTradeMessageSource,
		type: PoeTradeMessageType.featuresUpdate,
		features,
	};
}

export function isPoeTradeMessage(value: unknown): value is PoeTradeMessage {
	if (typeof value !== 'object' || value === null) return false;

	const message = value as { source?: unknown; type?: unknown; features?: unknown };

	return (
		message.source === poeTradeMessageSource &&
		message.type === PoeTradeMessageType.featuresUpdate &&
		isTradeFeatures(message.features)
	);
}

function isTradeFeatures(value: unknown): value is TradeFeatures {
	if (typeof value !== 'object' || value === null) return false;

	const features = value as { translate?: unknown; itemCopy?: unknown };
	return typeof features.translate === 'boolean' && typeof features.itemCopy === 'boolean';
}
