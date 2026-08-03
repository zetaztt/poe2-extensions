import { createIpcEnvelope, isIpcEnvelope, type IpcEnvelope, type IpcScope, type IpcTarget } from "./ipc-envelope";
import {
	IpcError,
	IpcErrorCode,
	IpcMessageKind,
	serializeIpcError,
	type IpcMessage,
	type IpcRequestMessage,
	type IpcResponseMessage,
} from "./ipc-message";
import { IpcRequestIdAllocator, type IpcRequestId } from "./ipc-request-id";
import { Result } from "../result";
import type { IpcChannelBackend, IpcHandlerChannelBackend } from "./ipc";
import {
	createPublishedNotification,
	ipcPublishedNotificationMethod,
	isPublishedNotification,
	maxRememberedPublishedNotifications,
	type IpcPublishedNotification,
} from "./ipc-utils";

type NotificationHandler = (params: unknown) => void | Promise<void>;
type RequestHandler = (params: unknown) => unknown | Promise<unknown>;
type TransportMessageListener = (value: unknown) => unknown;

interface RegisteredNotificationHandler {
	handler: NotificationHandler;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
	timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * 隔离无地址 Hub 与具体 transport 的 envelope 发送和入站监听。
 */
export interface IpcConnectionHubTransport {
	sendMessage(envelope: IpcEnvelope): Promise<unknown>;
	addMessageListener(listener: TransportMessageListener): void;
}

/**
 * 固定无地址 Hub 使用的单一 transport 及 envelope 路由方向。
 */
export interface IpcConnectionHubOptions {
	scope: IpcScope;
	outgoingTarget: IpcTarget;
	incomingTarget: IpcTarget;
	transport: IpcConnectionHubTransport;
}

/**
 * 直接维护无地址 IPC 的请求状态与消息分发。
 * Hub 不创建对端、握手或在线缓存；异步 response 仅通过 request ID 关联。
 */
export class IpcConnectionHub implements IpcChannelBackend {
	private readonly notificationHandlers = new Map<string, RegisteredNotificationHandler>();
	private readonly pendingRequests = new Map<IpcRequestId, PendingRequest>();
	private readonly requestIdAllocator = new IpcRequestIdAllocator();
	private readonly publishedNotificationIds = new Set<string>();
	private readonly publishedNotificationIdOrder: string[] = [];

	public constructor(private readonly options: IpcConnectionHubOptions) {
		this.install();
	}

	public invoke(method: string, data: unknown | undefined, timeoutMs: number): Promise<unknown> {
		const id = this.requestIdAllocator.allocate();
		const message: IpcRequestMessage = {
			kind: IpcMessageKind.Request,
			id,
			method,
			...(data === undefined ? {} : { data }),
		};

		return new Promise((resolve, reject) => {
			const pending: PendingRequest = { resolve, reject };
			pending.timeoutId = setTimeout(
				() => this.rejectPendingRequest(id, new IpcError(IpcErrorCode.Timeout, `IPC 请求超时: ${method}`)),
				Math.min(Math.max(0, timeoutMs), 2_147_483_647),
			);
			this.pendingRequests.set(id, pending);

			void this.sendMessage(message)
				.then((response) => {
					if (response?.kind === IpcMessageKind.Response) this.receiveResponse(response);
				})
				.catch((error) => this.rejectPendingRequest(id, error));
		});
	}

	/**
	 * 在本地分发后向当前 transport 发布 notification。
	 */
	public async send(method: string, data: unknown | undefined): Promise<void> {
		const notification = createPublishedNotification(method, data);
		this.rememberPublishedNotification(notification.id);
		await Promise.allSettled([
			this.dispatchPublishedNotification(notification),
			this.sendNotification(ipcPublishedNotificationMethod, notification),
		]);
	}

	/**
	 * 同 method 后注册者替换旧 handler，并接收直接和发布的 notification。
	 */
	public on(method: string, handler: NotificationHandler): () => void {
		const registration = { handler };
		this.notificationHandlers.set(method, registration);
		return () => {
			if (this.notificationHandlers.get(method) === registration) {
				this.notificationHandlers.delete(method);
			}
		};
	}

	private install(): void {
		const { transport, scope, incomingTarget, outgoingTarget } = this.options;
		transport.addMessageListener((value) => {
			if (!isIpcEnvelope(value, scope, incomingTarget)) return undefined;
			const message = value.message;
			const response = this.receiveMessage(message);
			if (message.kind !== IpcMessageKind.Request) {
				void response.catch((error) => {
					console.error("[poe2-extensions] IPC 入站消息处理失败", error);
				});
				return undefined;
			}
			return response.then((result) => {
				const responseMessage: IpcResponseMessage = Result.isOk(result)
					? {
							kind: IpcMessageKind.Response,
							id: message.id,
							...(result.value === undefined ? {} : { result: result.value }),
						}
					: {
							kind: IpcMessageKind.Response,
							id: message.id,
							error: serializeIpcError(result.error),
						};
				return createIpcEnvelope(scope, outgoingTarget, responseMessage);
			});
		});
	}

	/**
	 * 处理一条已验证来源的入站消息；子类可覆盖 Request 分支，并对支持的方法返回 Ok。
	 */
	protected async receiveMessage(message: IpcMessage): Promise<Result<unknown, IpcError>> {
		switch (message.kind) {
			case IpcMessageKind.Response:
				this.receiveResponse(message);
				return Result.ok();
			case IpcMessageKind.Notification:
				await this.receiveNotification(message.method, message.data);
				return Result.ok();
			case IpcMessageKind.Request:
				return Result.err(
					new IpcError(IpcErrorCode.InternalError, `IPC 消息处理未定义: ${IpcMessageKind.Request}`),
				);
		}
	}

	private async receiveNotification(method: string, data: unknown): Promise<void> {
		if (method === ipcPublishedNotificationMethod) {
			if (!isPublishedNotification(data) || this.publishedNotificationIds.has(data.id)) return;
			this.rememberPublishedNotification(data.id);
			await this.dispatchPublishedNotification(data);
			return;
		}

		this.dispatchNotification(method, data);
	}

	private dispatchPublishedNotification(notification: IpcPublishedNotification): Promise<void> {
		return Promise.resolve(this.notificationHandlers.get(notification.method)?.handler(notification.data));
	}

	private dispatchNotification(method: string, data: unknown): void {
		const handler = this.notificationHandlers.get(method)?.handler;
		if (!handler) return;
		void Promise.resolve(handler(data)).catch((error) => {
			console.error(`[poe2-extensions] IPC notification handler 执行失败: ${method}`, error);
		});
	}

	private async sendMessage(message: IpcMessage): Promise<IpcMessage | undefined> {
		const { transport, scope, outgoingTarget, incomingTarget } = this.options;
		const value = await transport.sendMessage(createIpcEnvelope(scope, outgoingTarget, message));
		return isIpcEnvelope(value, scope, incomingTarget) ? value.message : undefined;
	}

	private async sendNotification(method: string, data: unknown): Promise<void> {
		await this.sendMessage({
			kind: IpcMessageKind.Notification,
			method,
			...(data === undefined ? {} : { data }),
		});
	}

	private receiveResponse(message: IpcResponseMessage): void {
		const pending = this.pendingRequests.get(message.id);
		if (!pending) return;
		this.pendingRequests.delete(message.id);
		if (pending.timeoutId !== undefined) clearTimeout(pending.timeoutId);
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
		if (pending.timeoutId !== undefined) clearTimeout(pending.timeoutId);
		pending.reject(error);
	}

	private rememberPublishedNotification(id: string): void {
		this.publishedNotificationIds.add(id);
		this.publishedNotificationIdOrder.push(id);
		if (this.publishedNotificationIdOrder.length <= maxRememberedPublishedNotifications) return;
		const expiredId = this.publishedNotificationIdOrder.shift();
		if (expiredId) this.publishedNotificationIds.delete(expiredId);
	}
}

/**
 * 在无地址 Hub 上额外公开 RPC handler 注册能力。
 */
export class IpcHandlerConnectionHub extends IpcConnectionHub implements IpcHandlerChannelBackend {
	private readonly requestHandlers = new Map<string, RequestHandler>();

	public handle(method: string, handler: RequestHandler): () => void {
		this.requestHandlers.set(method, handler);
		return () => {
			if (this.requestHandlers.get(method) === handler) this.requestHandlers.delete(method);
		};
	}

	/**
	 * 仅接管 Request：已注册方法交给 handler，未注册方法向调用方返回稳定的 MethodNotFound。
	 * 其他消息继续沿用普通 Hub 的 pending 与 notification 分发。
	 */
	protected override async receiveMessage(message: IpcMessage): Promise<Result<unknown, IpcError>> {
		if (message.kind !== IpcMessageKind.Request) return super.receiveMessage(message);

		const handler = this.requestHandlers.get(message.method);
		if (!handler) {
			return Result.err(new IpcError(IpcErrorCode.MethodNotFound, `IPC 方法未定义: ${message.method}`));
		}
		try {
			return Result.ok(await handler(message.data));
		} catch (error) {
			const serializedError = serializeIpcError(error);
			return Result.err(new IpcError(serializedError.code, serializedError.message, serializedError.data));
		}
	}
}
