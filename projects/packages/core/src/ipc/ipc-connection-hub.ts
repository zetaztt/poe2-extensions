import { createIpcEnvelope, getPeerIpcRole, isIpcEnvelope, type IpcEnvelope, type IpcRole } from "./ipc-envelope";
import {
	IpcError,
	IpcErrorCode,
	IpcMessageKind,
	serializeIpcError,
	type IpcMessage,
	type IpcRequestMessage,
	type IpcResponseMessage,
} from "./ipc-message";
import { Result } from "../result";
import type { IpcChannelBackend, IpcHandlerChannelBackend } from "./ipc";

type NotificationHandler = (params: unknown) => void | Promise<void>;
type RequestHandler = (params: unknown) => unknown | Promise<unknown>;
interface RegisteredNotificationHandler {
	handler: NotificationHandler;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
	timeoutId?: ReturnType<typeof setTimeout>;
}

type IpcRequestId = string;

/**
 * 将运行环境消息 API 适配为无地址 IPC 的 envelope 发送和入站监听。
 */

export interface IpcMessageConnectionAdapter {
	sendMessage(envelope: IpcEnvelope): Promise<unknown>;
	addMessageListener(listener: (data: unknown) => unknown): void;
}

/**
 * 固定无地址 Hub 使用的单一 adapter 及本地发送方角色。
 */
export interface IpcConnectionHubOptions {
	role: IpcRole;
	adapter: IpcMessageConnectionAdapter;
}

/**
 * 直接维护无地址 IPC 的请求状态与消息分发。
 * Hub 不创建对端、握手或在线缓存；异步 response 仅通过 request ID 关联。
 */
export class IpcConnectionHub implements IpcChannelBackend {
	private readonly notificationHandlers = new Map<string, RegisteredNotificationHandler>();
	private readonly pendingRequests = new Map<IpcRequestId, PendingRequest>();

	public constructor(private readonly options: IpcConnectionHubOptions) {
		this.install();
	}

	private install(): void {
		const { adapter, role } = this.options;
		const incomingRole = getPeerIpcRole(role);
		adapter.addMessageListener((data) => {
			if (!isIpcEnvelope(data, incomingRole)) return undefined;
			const message = data.message;
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
				return createIpcEnvelope(role, responseMessage);
			});
		});
	}

	public invoke(method: string, data: unknown | undefined, timeoutMs: number): Promise<unknown> {
		const id = crypto.randomUUID();
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
	 * 在本地分发后，以原始业务 method 向当前 adapter 直接发送 notification。
	 *
	 * Hub 不包装或转发通知；需要多播时由发送端 adapter 显式投递全部接收端。
	 */
	public async send(method: string, data: unknown | undefined): Promise<void> {
		await Promise.allSettled([
			Promise.resolve(this.notificationHandlers.get(method)?.handler(data)),
			this.sendNotification(method, data),
		]);
	}

	/**
	 * 同 method 后注册者替换旧 handler，并接收当前 adapter 直达的 notification。
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

	private receiveNotification(method: string, data: unknown): void {
		this.dispatchNotification(method, data);
	}

	private dispatchNotification(method: string, data: unknown): void {
		const handler = this.notificationHandlers.get(method)?.handler;
		if (!handler) return;
		void Promise.resolve(handler(data)).catch((error) => {
			console.error(`[poe2-extensions] IPC notification handler 执行失败: ${method}`, error);
		});
	}

	private async sendMessage(message: IpcMessage): Promise<IpcMessage | undefined> {
		const { adapter, role } = this.options;
		const incomingRole = getPeerIpcRole(role);
		const value = await adapter.sendMessage(createIpcEnvelope(role, message));
		return isIpcEnvelope(value, incomingRole) ? value.message : undefined;
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
