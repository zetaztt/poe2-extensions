import type { TradeStatPreset } from "../types";
import {
	createStatPresetDeleteMessage,
	createStatPresetListMessage,
	createStatPresetRenameMessage,
	createStatPresetSaveMessage,
	isPoeStatPresetResponseMessage,
	PoeStatPresetMessageType,
	type PoeStatPresetResponseMessage,
} from "./messages";
import { requestTimeoutMs } from "./constants";
import { createRequestId } from "./utils";

const pendingRequests = new Map<
	string,
	{
		resolve: (message: PoeStatPresetResponseMessage) => void;
		reject: (error: Error) => void;
		timeoutId: number;
	}
>();

export function requestPresetList(): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetListMessage(createRequestId()));
}

export function requestSavePreset(preset: TradeStatPreset): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetSaveMessage(createRequestId(), preset));
}

export function requestRenamePreset(oldName: string, newName: string): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetRenameMessage(createRequestId(), oldName, newName));
}

export function requestDeletePreset(name: string): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetDeleteMessage(createRequestId(), name));
}

export function handleStorageResponse(event: MessageEvent<unknown>): void {
	if (event.source !== window || !isPoeStatPresetResponseMessage(event.data)) return;

	const pending = pendingRequests.get(event.data.requestId);
	if (!pending) return;

	pendingRequests.delete(event.data.requestId);
	window.clearTimeout(pending.timeoutId);
	pending.resolve(event.data);
}

export function rejectPendingRequests(error: Error): void {
	for (const request of pendingRequests.values()) {
		window.clearTimeout(request.timeoutId);
		request.reject(error);
	}
	pendingRequests.clear();
}

function sendStorageRequest(
	message: ReturnType<
		| typeof createStatPresetListMessage
		| typeof createStatPresetSaveMessage
		| typeof createStatPresetRenameMessage
		| typeof createStatPresetDeleteMessage
	>,
): Promise<TradeStatPreset[]> {
	return new Promise((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			pendingRequests.delete(message.requestId);
			reject(new Error("筛选预设存储无响应"));
		}, requestTimeoutMs);

		pendingRequests.set(message.requestId, {
			resolve: (response) => {
				if (response.type === PoeStatPresetMessageType.error) {
					reject(new Error(response.error.message));
					return;
				}

				resolve(response.presets);
			},
			reject,
			timeoutId,
		});

		window.postMessage(message, window.location.origin);
	});
}
