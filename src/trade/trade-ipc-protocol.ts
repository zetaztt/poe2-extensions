import { defineIpcProtocol, defineNotification, defineRpc } from "../ipc/ipc-protocol";
import type { TranslateDictionary } from "../translate-dictionary";
import type { TradeStatPreset } from "./trade-types";

export interface TradeFeatureUpdateData {
	enabled: boolean;
}
export interface SaveStatPresetParams {
	preset: TradeStatPreset;
}
export interface RenameStatPresetParams {
	oldName: string;
	newName: string;
}
export interface DeleteStatPresetParams {
	name: string;
}

export const tradeIpcProtocol = defineIpcProtocol({
	name: "trade",
	fetchDictionary: defineRpc<void, TranslateDictionary>({
		timeoutMs: 15_000,
	}),
	getTradeItemCopyEnabled: defineRpc<void, boolean>(),
	getTradeStatPresetEnabled: defineRpc<void, boolean>(),
	listStatPresets: defineRpc<void, TradeStatPreset[]>(),
	saveStatPreset: defineRpc<SaveStatPresetParams, TradeStatPreset[]>(),
	renameStatPreset: defineRpc<RenameStatPresetParams, TradeStatPreset[]>(),
	deleteStatPreset: defineRpc<DeleteStatPresetParams, TradeStatPreset[]>(),
	syncTranslateInjection: defineNotification<void>(),
	itemCopyUpdated: defineNotification<TradeFeatureUpdateData>(),
	statPresetUpdated: defineNotification<TradeFeatureUpdateData>(),
});
