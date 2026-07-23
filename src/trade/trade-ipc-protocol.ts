import { defineIpcProtocol, defineNotification, defineRpc } from "../ipc/ipc-protocol";
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
	listStatPresets: defineRpc<void, TradeStatPreset[]>(),
	saveStatPreset: defineRpc<SaveStatPresetParams, TradeStatPreset[]>(),
	renameStatPreset: defineRpc<RenameStatPresetParams, TradeStatPreset[]>(),
	deleteStatPreset: defineRpc<DeleteStatPresetParams, TradeStatPreset[]>(),
	itemCopyUpdated: defineNotification<TradeFeatureUpdateData>(),
	statPresetUpdated: defineNotification<TradeFeatureUpdateData>(),
});
