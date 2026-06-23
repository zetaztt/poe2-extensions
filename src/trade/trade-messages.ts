export const poeTradeMessageSource = "poe2-extensions:trade";

export const PoeTradeMessageType = {
	itemCopyUpdate: "POE_TRADE_ITEM_COPY_UPDATE",
	statPresetUpdate: "POE_TRADE_STAT_PRESET_UPDATE",
	syncTranslateInjection: "POE_TRADE_SYNC_TRANSLATE_INJECTION",
} as const;

export type PoeTradeItemCopyUpdateMessage = {
	source: typeof poeTradeMessageSource;
	type: typeof PoeTradeMessageType.itemCopyUpdate;
	enabled: boolean;
};

export type PoeTradeStatPresetUpdateMessage = {
	source: typeof poeTradeMessageSource;
	type: typeof PoeTradeMessageType.statPresetUpdate;
	enabled: boolean;
};

export type PoeTradeSyncTranslateInjectionMessage = {
	source: typeof poeTradeMessageSource;
	type: typeof PoeTradeMessageType.syncTranslateInjection;
};

export type PoeTradeMessage =
	| PoeTradeItemCopyUpdateMessage
	| PoeTradeStatPresetUpdateMessage
	| PoeTradeSyncTranslateInjectionMessage;

export function createTradeItemCopyUpdateMessage(enabled: boolean): PoeTradeItemCopyUpdateMessage {
	return {
		source: poeTradeMessageSource,
		type: PoeTradeMessageType.itemCopyUpdate,
		enabled,
	};
}

export function createTradeStatPresetUpdateMessage(enabled: boolean): PoeTradeStatPresetUpdateMessage {
	return {
		source: poeTradeMessageSource,
		type: PoeTradeMessageType.statPresetUpdate,
		enabled,
	};
}

export function createTradeSyncTranslateInjectionMessage(): PoeTradeSyncTranslateInjectionMessage {
	return {
		source: poeTradeMessageSource,
		type: PoeTradeMessageType.syncTranslateInjection,
	};
}

export function isPoeTradeMessage(value: unknown): value is PoeTradeMessage {
	if (typeof value !== "object" || value === null) return false;

	const message = value as { source?: unknown; type?: unknown; enabled?: unknown };
	if (message.source !== poeTradeMessageSource) return false;

	if (message.type === PoeTradeMessageType.syncTranslateInjection) return true;

	return (
		(message.type === PoeTradeMessageType.itemCopyUpdate || message.type === PoeTradeMessageType.statPresetUpdate)
		&& typeof message.enabled === "boolean"
	);
}

export function isPoeTradeItemCopyUpdateMessage(value: unknown): value is PoeTradeItemCopyUpdateMessage {
	return isPoeTradeMessage(value) && value.type === PoeTradeMessageType.itemCopyUpdate;
}

export function isPoeTradeStatPresetUpdateMessage(value: unknown): value is PoeTradeStatPresetUpdateMessage {
	return isPoeTradeMessage(value) && value.type === PoeTradeMessageType.statPresetUpdate;
}

export function isPoeTradeSyncTranslateInjectionMessage(
	value: unknown,
): value is PoeTradeSyncTranslateInjectionMessage {
	return isPoeTradeMessage(value) && value.type === PoeTradeMessageType.syncTranslateInjection;
}
