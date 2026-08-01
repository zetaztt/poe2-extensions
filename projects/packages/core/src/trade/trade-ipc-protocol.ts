import { defineIpcProtocol, defineNotification, defineRpc } from "../ipc/ipc-protocol";
import type { TradeStatPreset } from "./trade-types";

/**
 * background 向活动 trade2 页面的功能启停通知载荷。
 */
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

/**
 * trade 领域 RPC；设置写入和筛选预设持久化都由 background 执行。
 */
export const tradeIpcProtocol = defineIpcProtocol({
	name: "trade",
	listStatPresets: defineRpc<void, TradeStatPreset[]>(),
	saveStatPreset: defineRpc<SaveStatPresetParams, TradeStatPreset[]>(),
	renameStatPreset: defineRpc<RenameStatPresetParams, TradeStatPreset[]>(),
	deleteStatPreset: defineRpc<DeleteStatPresetParams, TradeStatPreset[]>(),
	setTranslateEnabled: defineRpc<TradeFeatureUpdateData, boolean>(),
	setItemCopyEnabled: defineRpc<TradeFeatureUpdateData, boolean>(),
	setStatPresetEnabled: defineRpc<TradeFeatureUpdateData, boolean>(),
	itemCopyUpdated: defineNotification<TradeFeatureUpdateData>(),
	statPresetUpdated: defineNotification<TradeFeatureUpdateData>(),
});
