import type { TradeStatPreset, TradeStatPresetQuery } from "../trade-types";

const poeStatPresetMessageSource = "poe2-extensions:trade-stat-preset";

export enum PoeStatPresetMessageType {
	List = 1,
	Save = 2,
	Rename = 3,
	Delete = 4,
	Result = 5,
	Error = 6,
}

interface PoeStatPresetBaseMessage {
	source: typeof poeStatPresetMessageSource;
	type: PoeStatPresetMessageType;
	requestId: string;
}

interface PoeStatPresetListMessage extends PoeStatPresetBaseMessage {
	type: PoeStatPresetMessageType.List;
}

interface PoeStatPresetSaveMessage extends PoeStatPresetBaseMessage {
	type: PoeStatPresetMessageType.Save;
	preset: TradeStatPreset;
}

interface PoeStatPresetRenameMessage extends PoeStatPresetBaseMessage {
	type: PoeStatPresetMessageType.Rename;
	oldName: string;
	newName: string;
}

interface PoeStatPresetDeleteMessage extends PoeStatPresetBaseMessage {
	type: PoeStatPresetMessageType.Delete;
	name: string;
}

interface PoeStatPresetResultMessage extends PoeStatPresetBaseMessage {
	type: PoeStatPresetMessageType.Result;
	presets: TradeStatPreset[];
}

interface PoeStatPresetErrorMessage extends PoeStatPresetBaseMessage {
	type: PoeStatPresetMessageType.Error;
	error: {
		message: string;
	};
}

export type PoeStatPresetRequestMessage =
	| PoeStatPresetListMessage
	| PoeStatPresetSaveMessage
	| PoeStatPresetRenameMessage
	| PoeStatPresetDeleteMessage;

export type PoeStatPresetResponseMessage = PoeStatPresetResultMessage | PoeStatPresetErrorMessage;

export function createStatPresetListMessage(requestId: string): PoeStatPresetListMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.List,
		requestId,
	};
}

export function createStatPresetSaveMessage(requestId: string, preset: TradeStatPreset): PoeStatPresetSaveMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.Save,
		requestId,
		preset,
	};
}

export function createStatPresetRenameMessage(
	requestId: string,
	oldName: string,
	newName: string,
): PoeStatPresetRenameMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.Rename,
		requestId,
		oldName,
		newName,
	};
}

export function createStatPresetDeleteMessage(requestId: string, name: string): PoeStatPresetDeleteMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.Delete,
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
		type: PoeStatPresetMessageType.Result,
		requestId,
		presets,
	};
}

export function createStatPresetErrorMessage(requestId: string, error: unknown): PoeStatPresetErrorMessage {
	return {
		source: poeStatPresetMessageSource,
		type: PoeStatPresetMessageType.Error,
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
		oldName?: unknown;
		newName?: unknown;
	};

	if (message.type === PoeStatPresetMessageType.List) return true;
	if (message.type === PoeStatPresetMessageType.Save) return isTradeStatPreset(message.preset);
	if (message.type === PoeStatPresetMessageType.Rename) {
		return typeof message.oldName === "string" && typeof message.newName === "string";
	}
	if (message.type === PoeStatPresetMessageType.Delete) return typeof message.name === "string";

	return false;
}

export function isPoeStatPresetResponseMessage(value: unknown): value is PoeStatPresetResponseMessage {
	if (!isPoeStatPresetMessageBase(value)) return false;

	const message = value as {
		type?: unknown;
		presets?: unknown;
		error?: unknown;
	};

	if (message.type === PoeStatPresetMessageType.Result) return isTradeStatPresetArray(message.presets);
	if (message.type === PoeStatPresetMessageType.Error) return isStatPresetError(message.error);

	return false;
}

export function isTradeStatPresetArray(value: unknown): value is TradeStatPreset[] {
	return Array.isArray(value) && value.every(isTradeStatPreset);
}

function isPoeStatPresetMessageBase(value: unknown): value is PoeStatPresetBaseMessage {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

	const message = value as PoeStatPresetBaseMessage;
	return (
		message.source === poeStatPresetMessageSource
		&& typeof message.type === "number"
		&& typeof message.requestId === "string"
	);
}

function isTradeStatPreset(value: unknown): value is TradeStatPreset {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;

	const preset = value as TradeStatPreset;
	return typeof preset.name === "string" && isTradeStatPresetQuery(preset.query);
}

function isTradeStatPresetQuery(value: unknown): value is TradeStatPresetQuery {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStatPresetError(value: unknown): value is PoeStatPresetErrorMessage["error"] {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	return typeof (value as PoeStatPresetErrorMessage["error"]).message === "string";
}
