import { defineIpcProtocol, defineNotification, defineRpc } from "../ipc/ipc-protocol";
import type { TradeSettingsSnapshot, TradeSettingsUpdateResult, UpdateTradeSettingParams } from "./settings-types";

export const settingsIpcProtocol = defineIpcProtocol({
	name: "settings",
	load: defineRpc<void, TradeSettingsSnapshot>(),
	update: defineRpc<UpdateTradeSettingParams, TradeSettingsUpdateResult>(),
	changed: defineNotification<TradeSettingsSnapshot>(),
});
