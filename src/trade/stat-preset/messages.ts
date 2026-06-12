import type { TradeStatPreset, TradeStatPresetQuery } from '../types';

export const poeStatPresetMessageSource = 'poe2-extensions:trade-stat-preset';

export const PoeStatPresetMessageType = {
	list: 'STAT_PRESET_LIST',
	save: 'STAT_PRESET_SAVE',
	delete: 'STAT_PRESET_DELETE',
	result: 'STAT_PRESET_RESULT',
	error: 'STAT_PRESET_ERROR',
} as const;

interface PoeStatPresetBaseMessage {
	source: typeof poeStatPresetMessageSource;
	type: string;
	requestId: string;
}

export interface PoeStatPresetListMessage extends PoeStatPresetBaseMessage {
	type: typeof PoeStatPresetMessageType.list;
}

export interface PoeStatPresetSaveMessage extends PoeStatPresetBaseMessage {
	type: typeof PoeStatPresetMessageType.save;
	preset: TradeStatPreset;
}

export interface PoeStatPresetDeleteMessage extends PoeStatPresetBaseMessage {
	type: typeof PoeStatPresetMessageType.delete;
	name: string;
}

export interface PoeStatPresetResultMessage extends PoeStatPresetBaseMessage {
	type: typeof PoeStatPresetMessageType.result;
	presets: TradeStatPreset[];
}

export interface PoeStatPresetErrorMessage extends PoeStatPresetBaseMessage {
	type: typeof PoeStatPresetMessageType.error;
	error: {
		message: string;
	};
}

export type PoeStatPresetRequestMessage =
	| PoeStatPresetListMessage
	| PoeStatPresetSaveMessage
	| PoeStatPresetDeleteMessage;

export type PoeStatPresetResponseMessage =
	| PoeStatPresetResultMessage
	| PoeStatPresetErrorMessage;

export type PoeStatPresetMessage = PoeStatPresetRequestMessage | PoeStatPresetResponseMessage;

export function createStatPresetListMessage(requestId: string): PoeStatPresetListMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.list,
		requestId,
	};
}

export function createStatPresetSaveMessage(requestId: string, preset: TradeStatPreset): PoeStatPresetSaveMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.save,
		requestId,
		preset,
	};
}

export function createStatPresetDeleteMessage(requestId: string, name: string): PoeStatPresetDeleteMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.delete,
		requestId,
		name,
	};
}

export function createStatPresetResultMessage(
	requestId: string,
	presets: TradeStatPreset[],
): PoeStatPresetResultMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.result,
		requestId,
		presets,
	};
}

export function createStatPresetErrorMessage(requestId: string, error: unknown): PoeStatPresetErrorMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.error,
		requestId,
		error: {
			message: error instanceof Error ? error.message : String(error),
		},
	};
}

export function isPoeStatPresetRequestMessage(value: unknown): value is PoeStatPresetRequestMessage {
	if (!isPoeStatPresetMessageBase(value)) return false;

	const message = value as {
		type?: unknown;
		preset?: unknown;
		name?: unknown;
	};

	if (message.type === PoeStatPresetMessageType.list) return true;
	if (message.type === PoeStatPresetMessageType.save) return isTradeStatPreset(message.preset);
	if (message.type === PoeStatPresetMessageType.delete) return typeof message.name === 'string';

	return false;
}

export function isPoeStatPresetResponseMessage(value: unknown): value is PoeStatPresetResponseMessage {
	if (!isPoeStatPresetMessageBase(value)) return false;

	const message = value as {
		type?: unknown;
		presets?: unknown;
		error?: unknown;
	};

	if (message.type === PoeStatPresetMessageType.result) return isTradeStatPresetArray(message.presets);
	if (message.type === PoeStatPresetMessageType.error) return isStatPresetError(message.error);

	return false;
}

export function isTradeStatPresetArray(value: unknown): value is TradeStatPreset[] {
	return Array.isArray(value) && value.every(isTradeStatPreset);
}

function isPoeStatPresetMessageBase(value: unknown): value is PoeStatPresetBaseMessage {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	const message = value as PoeStatPresetBaseMessage;
	return (
		message.source === poeStatPresetMessageSource &&
		typeof message.type === 'string' &&
		typeof message.requestId === 'string'
	);
}

function isTradeStatPreset(value: unknown): value is TradeStatPreset {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	const preset = value as TradeStatPreset;
	return typeof preset.name === 'string' && isTradeStatPresetQuery(preset.query);
}

function isTradeStatPresetQuery(value: unknown): value is TradeStatPresetQuery {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStatPresetError(value: unknown): value is PoeStatPresetErrorMessage['error'] {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
	return typeof (value as PoeStatPresetErrorMessage['error']).message === 'string';
}
