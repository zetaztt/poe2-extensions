import type { TranslateDictionary } from '../translate-dictionary';

export const poeTranslationMessageSource = 'poe2-extensions:trade-translate';

export const PoeTranslationMessageType = {
	fetch: 'POE_TRANSLATION_FETCH',
	result: 'POE_TRANSLATION_FETCH_RESULT',
	error: 'POE_TRANSLATION_FETCH_ERROR',
} as const;

export type PoeTranslationFetchMessage = {
	source: typeof poeTranslationMessageSource;
	type: typeof PoeTranslationMessageType.fetch;
	requestId: string;
};

export type PoeTranslationFetchResultMessage = {
	source: typeof poeTranslationMessageSource;
	type: typeof PoeTranslationMessageType.result;
	requestId: string;
	dictionary: TranslateDictionary;
};

export type PoeTranslationFetchErrorMessage = {
	source: typeof poeTranslationMessageSource;
	type: typeof PoeTranslationMessageType.error;
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

export function isPoeTranslationMessage(value: unknown): value is PoeTranslationMessage {
	const type = (value as { type?: unknown })?.type;

	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { source?: unknown }).source === poeTranslationMessageSource &&
		(
			type === PoeTranslationMessageType.fetch ||
			type === PoeTranslationMessageType.result ||
			type === PoeTranslationMessageType.error
		)
	);
}
