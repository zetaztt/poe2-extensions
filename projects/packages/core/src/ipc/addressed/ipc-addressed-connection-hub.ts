import { IpcError, IpcErrorCode, IpcMessageKind, type IpcMessage, type IpcResponseMessage } from "../ipc-message";
import { createIpcEnvelope, isIpcEnvelope, type IpcEnvelope, type IpcScope, type IpcTarget } from "../ipc-envelope";
import { IpcRequestIdAllocator, type IpcRequestId } from "../ipc-request-id";
import { Result } from "../../result";
import type { IpcAddressedChannelBackend } from "./ipc-addressed";

type NotificationHandler<TAddress> = (address: TAddress, data: unknown) => void | Promise<void>;

interface RegisteredNotificationHandler<TAddress> {
	handler: NotificationHandler<TAddress>;
}

interface PendingRequest<TAddress> {
	address: TAddress;
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * 隔离具体 transport 的 envelope 发送与入站监听，使 Hub 不感知运行环境 API。
 */
export interface IpcAddressedConnectionHubTransport<TAddress> {
	sendMessage(address: TAddress, envelope: IpcEnvelope): Promise<unknown>;
	addMessageListener(listener: (value: unknown, address: TAddress | undefined) => unknown): void;
}

/**
 * 固定一个 Addressed Hub 实例使用的 transport 与 envelope 路由方向。
 */
export interface IpcAddressedConnectionHubOptions<TAddress> {
	scope: IpcScope;
	outgoingTarget: IpcTarget;
	incomingTarget: IpcTarget;
	transport: IpcAddressedConnectionHubTransport<TAddress>;
}

/**
 * 使用共享 pending 状态实现以 address 定向调用的无状态 Hub。
 * 入站与出站均直接处理 message，不创建或缓存 connection、对端及在线状态。
 */
export class IpcAddressedConnectionHub<TAddress> implements IpcAddressedChannelBackend<TAddress> {
	private readonly notificationHandlers = new Map<string, RegisteredNotificationHandler<TAddress>>();
	private readonly pendingRequests = new Map<IpcRequestId, PendingRequest<TAddress>>();
	private readonly requestIdAllocator = new IpcRequestIdAllocator();

	public constructor(private readonly options: IpcAddressedConnectionHubOptions<TAddress>) {
		this.install();
	}

	private install(): void {
		const { scope, outgoingTarget, incomingTarget, transport } = this.options;
		transport.addMessageListener((value, address) => {
			if (!isIpcEnvelope(value, scope, incomingTarget) || address === undefined) return undefined;
			const message = value.message;
			return this.receiveMessage(address, message).then((result) => {
				if (message.kind !== IpcMessageKind.Request) return undefined;
				const response: IpcResponseMessage = Result.isOk(result)
					? {
							kind: IpcMessageKind.Response,
							id: message.id,
							...(result.value === undefined ? {} : { result: result.value }),
						}
					: {
							kind: IpcMessageKind.Response,
							id: message.id,
							error: {
								code: result.error.code,
								message: result.error.message,
								...(result.error.data === undefined ? {} : { data: result.error.data }),
							},
						};
				return createIpcEnvelope(scope, outgoingTarget, response);
			});
		});
	}

	public async invoke(
		address: TAddress,
		method: string,
		params: unknown | undefined,
		timeoutMs: number,
	): Promise<unknown> {
		const id = this.allocateRequestId();
		const message: IpcMessage = {
			kind: IpcMessageKind.Request,
			id,
			method,
			...(params === undefined ? {} : { data: params }),
		};

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(
				() => this.rejectPendingRequest(id, new IpcError(IpcErrorCode.Timeout, `IPC 请求超时: ${method}`)),
				Math.min(Math.max(0, timeoutMs), 2_147_483_647),
			);
			this.pendingRequests.set(id, { address, resolve, reject, timeoutId });

			void this.sendMessage(address, message)
				.then((response) => {
					if (response?.kind === IpcMessageKind.Response) this.receiveResponse(address, response);
				})
				.catch((error) => this.rejectPendingRequest(id, error));
		});
	}

	public async send(address: TAddress, method: string, data: unknown | undefined): Promise<void> {
		await this.sendMessage(address, {
			kind: IpcMessageKind.Notification,
			method,
			...(data === undefined ? {} : { data }),
		});
	}

	public on(method: string, handler: NotificationHandler<TAddress>): () => void {
		const registration = { handler };
		this.notificationHandlers.set(method, registration);
		return () => {
			if (this.notificationHandlers.get(method) === registration) {
				this.notificationHandlers.delete(method);
			}
		};
	}

	private async sendMessage(address: TAddress, message: IpcMessage): Promise<IpcMessage | undefined> {
		const { transport, scope, outgoingTarget, incomingTarget } = this.options;
		const value = await transport.sendMessage(address, createIpcEnvelope(scope, outgoingTarget, message));
		return isIpcEnvelope(value, scope, incomingTarget) ? value.message : undefined;
	}

	/**
	 * 仅允许原请求 address 的 response 完成 pending，避免不同对端复用 ID 时串扰。
	 */
	private receiveResponse(address: TAddress, message: IpcResponseMessage): void {
		const pending = this.pendingRequests.get(message.id);
		if (!pending || !Object.is(pending.address, address)) return;

		this.pendingRequests.delete(message.id);
		clearTimeout(pending.timeoutId);
		if (message.error) {
			pending.reject(new IpcError(message.error.code, message.error.message, message.error.data));
			return;
		}
		pending.resolve(message.result);
	}

	private rejectPendingRequest(id: IpcRequestId, error: unknown): void {
		const pending = this.pendingRequests.get(id);
		if (!pending) return;
		this.pendingRequests.delete(id);
		clearTimeout(pending.timeoutId);
		pending.reject(error);
	}

	private allocateRequestId(): IpcRequestId {
		return this.requestIdAllocator.allocate();
	}

	/**
	 * 处理一条已验证来源的入站消息；子类可覆盖 Request 分支，并对支持的方法返回 Ok。
	 */
	protected async receiveMessage(address: TAddress, message: IpcMessage): Promise<Result<unknown, IpcError>> {
		switch (message.kind) {
			case IpcMessageKind.Response:
				this.receiveResponse(address, message);
				return Result.ok();
			case IpcMessageKind.Notification: {
				const handler = this.notificationHandlers.get(message.method)?.handler;
				if (handler) {
					void Promise.resolve()
						.then(() => handler(address, message.data))
						.catch((error) => {
							console.error(
								`[poe2-extensions] IPC notification handler 执行失败: ${message.method}`,
								error,
							);
						});
				}
				return Result.ok();
			}
			case IpcMessageKind.Request:
				return Result.err(
					new IpcError(IpcErrorCode.InternalError, `IPC 消息处理未定义: ${IpcMessageKind.Request}`),
				);
		}
	}
}
