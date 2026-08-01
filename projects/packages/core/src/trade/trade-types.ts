/**
 * storage.local 与 IPC 共用的筛选预设；query 是官方页面 stat group 的普通数据快照。
 */
export interface TradeStatPreset {
	name: string;
	query: TradeStatPresetQuery;
}

/**
 * 官方 stat group query 的开放结构；持久化边界将其作为普通 record 校验和保存。
 */
export type TradeStatPresetQuery = Record<string, unknown>;
