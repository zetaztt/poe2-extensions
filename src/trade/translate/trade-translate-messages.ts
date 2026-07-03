import type { TranslateDictionary } from "../../translate-dictionary";

export const poeTranslationMessageSource = "poe2-extensions:trade:translate";

export enum PoeTranslationMessageType {
	Fetch = 1,
	Result = 2,
	Error = 3,
}

export type PoeTranslationFetchMessage = {
	source: typeof poeTranslationMessageSource;
	type: PoeTranslationMessageType.Fetch;
	requestId: string;
};

export type PoeTranslationFetchResultMessage = {
	source: typeof poeTranslationMessageSource;
	type: PoeTranslationMessageType.Result;
	requestId: string;
	dictionary: TranslateDictionary;
};

export type PoeTranslationFetchErrorMessage = {
	source: typeof poeTranslationMessageSource;
	type: PoeTranslationMessageType.Error;
	requestId: string;
	error: {
		message: string;
		status?: number;
		statusText?: string;
	};
};

export type PoeTranslationMessage =
	| PoeTranslationFetchMessage
	| PoeTranslationFetchResultMessage
	| PoeTranslationFetchErrorMessage;

export function createPoeTranslationFetchMessage(requestId: string): PoeTranslationFetchMessage {
	return {
		source: poeTranslationMessageSource,
		type: PoeTranslationMessageType.Fetch,
		requestId,
	};
}

export function isPoeTranslationMessage(value: unknown): value is PoeTranslationMessage {
	const type = (value as { type?: unknown })?.type;

	return (
		typeof value === "object"
		&& value !== null
		&& (value as { source?: unknown }).source === poeTranslationMessageSource
		&& (type === PoeTranslationMessageType.Fetch
			|| type === PoeTranslationMessageType.Result
			|| type === PoeTranslationMessageType.Error)
	);
}
