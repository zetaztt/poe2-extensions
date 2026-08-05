import { isIpcEnvelope, type IpcEnvelope, type IpcRole } from "./ipc-envelope";

/**
 * 将 relay 的来源监听与目标发送组合为一个明确方向的 adapter。
 *
 * 该接口有意区别于单一 transport 的双工 connection adapter，避免把来源消息发回同一 transport。
 */
export interface IpcEnvelopeRelayAdapter {
	/**
	 * 在来源 transport 上注册入站消息监听。
	 */
	addSourceMessageListener(listener: (data: unknown) => unknown): void;

	/**
	 * 向目标 transport 发送已验证的 envelope，并返回目标 adapter 的原始响应。
	 */
	sendTargetMessage(envelope: IpcEnvelope): Promise<unknown>;
}

/**
 * 描述单向 relay 接受的来源角色及跨 transport adapter。
 */
export interface IpcEnvelopeRelayOptions {
	sourceRole: IpcRole;
	adapter: IpcEnvelopeRelayAdapter;
}

/**
 * 为一个明确方向注册 envelope relay。
 *
 * Relay 不解析业务消息或重建 envelope，因此发送方角色、request ID 和 response 原样跨运行环境传递。
 * source 只接受明确的发送方角色，避免同一共享 transport 上的消息被转回来路。
 * 双向通信由 composition root 分别组合并注册两个方向，使跨 transport 边界保持显式。
 */
export function installIpcEnvelopeRelay(options: IpcEnvelopeRelayOptions): void {
	options.adapter.addSourceMessageListener((data) => {
		if (!isIpcEnvelope(data, options.sourceRole)) return undefined;
		return options.adapter.sendTargetMessage(data);
	});
}
