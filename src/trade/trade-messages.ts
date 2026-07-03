export const poeTradeMessageSource = "poe2-extensions:trade";

export enum PoeTradeMessageType {
	ItemCopyUpdate = 1,
	StatPresetUpdate = 2,
	SyncTranslateInjection = 3,
}

export type PoeTradeItemCopyUpdateMessage = {
	source: typeof poeTradeMessageSource;
	type: PoeTradeMessageType.ItemCopyUpdate;
	enabled: boolean;
};

export type PoeTradeStatPresetUpdateMessage = {
	source: typeof poeTradeMessageSource;
	type: PoeTradeMessageType.StatPresetUpdate;
	enabled: boolean;
};

export type PoeTradeSyncTranslateInjectionMessage = {
	source: typeof poeTradeMessageSource;
	type: PoeTradeMessageType.SyncTranslateInjection;
};

export type PoeTradeMessage =
	| PoeTradeItemCopyUpdateMessage
	| PoeTradeStatPresetUpdateMessage
	| PoeTradeSyncTranslateInjectionMessage;

export function createTradeItemCopyUpdateMessage(enabled: boolean): PoeTradeItemCopyUpdateMessage {
	return {
		source: poeTradeMessageSource,
		type: PoeTradeMessageType.ItemCopyUpdate,
		enabled,
	};
}

export function createTradeStatPresetUpdateMessage(enabled: boolean): PoeTradeStatPresetUpdateMessage {
	return {
		source: poeTradeMessageSource,
		type: PoeTradeMessageType.StatPresetUpdate,
		enabled,
	};
}

export function createTradeSyncTranslateInjectionMessage(): PoeTradeSyncTranslateInjectionMessage {
	return {
		source: poeTradeMessageSource,
		type: PoeTradeMessageType.SyncTranslateInjection,
	};
}

export function isPoeTradeMessage(value: unknown): value is PoeTradeMessage {
	if (typeof value !== "object" || value === null) return false;

	const message = value as { source?: unknown; type?: unknown; enabled?: unknown };
	if (message.source !== poeTradeMessageSource) return false;

	if (message.type === PoeTradeMessageType.SyncTranslateInjection) return true;

	return (
		(message.type === PoeTradeMessageType.ItemCopyUpdate || message.type === PoeTradeMessageType.StatPresetUpdate)
		&& typeof message.enabled === "boolean"
	);
}

export function isPoeTradeItemCopyUpdateMessage(value: unknown): value is PoeTradeItemCopyUpdateMessage {
	return isPoeTradeMessage(value) && value.type === PoeTradeMessageType.ItemCopyUpdate;
}

export function isPoeTradeStatPresetUpdateMessage(value: unknown): value is PoeTradeStatPresetUpdateMessage {
	return isPoeTradeMessage(value) && value.type === PoeTradeMessageType.StatPresetUpdate;
}

export function isPoeTradeSyncTranslateInjectionMessage(
	value: unknown,
): value is PoeTradeSyncTranslateInjectionMessage {
	return isPoeTradeMessage(value) && value.type === PoeTradeMessageType.SyncTranslateInjection;
}
