import { isIpcEnvelope, type IpcScope, type IpcTarget } from "./ipc-envelope";
import type { IpcConnectionHubTransport } from "./ipc-connection-hub";

/**
 * 描述 relay 一侧允许进入的 envelope 与承载它的 transport。
 */
export interface IpcEnvelopeRelayEndpointOptions {
	scope: IpcScope;
	incomingTarget: IpcTarget;
	transport: IpcConnectionHubTransport;
}

/**
 * 固定 relay 的两个 transport 端点，两侧的入站规则同时定义转发方向。
 */
export interface IpcEnvelopeRelayOptions {
	first: IpcEnvelopeRelayEndpointOptions;
	second: IpcEnvelopeRelayEndpointOptions;
}

/**
 * 在两个 transport 之间透明转发合法 envelope。
 *
 * Relay 不解析业务消息或重建 envelope，因此 request ID 和 response 原样跨运行环境传递。
 * 每侧只接受明确的 scope/target，避免同一共享 transport 上的消息被转回来路。
 */
export class IpcEnvelopeRelay {
	public constructor(options: IpcEnvelopeRelayOptions) {
		this.installDirection(options.first, options.second);
		this.installDirection(options.second, options.first);
	}

	private installDirection(source: IpcEnvelopeRelayEndpointOptions, target: IpcEnvelopeRelayEndpointOptions): void {
		source.transport.addMessageListener((value) => {
			if (!isIpcEnvelope(value, source.scope, source.incomingTarget)) return undefined;
			return target.transport.sendMessage(value);
		});
	}
}
