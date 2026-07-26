export const IpcMessageKind = {
	Request: "request",
	Response: "response",
	Notification: "notification",
} as const;

export const IpcErrorCode = {
	Timeout: -32_000,
	ConnectionDisposed: -32_001,
	MethodNotFound: -32_601,
	InternalError: -32_603,
} as const;

const ipcErrorMarker = Symbol.for("poe2-extensions:ipc-error");

export interface Disposable {
	dispose(): void;
}

export interface IpcErrorData {
	code: number;
	message: string;
	data?: unknown;
}

export interface IpcRequestMessage {
	kind: typeof IpcMessageKind.Request;
	id: number;
	method: string;
	data?: unknown;
	deadline?: number;
}

export interface IpcResponseMessage {
	kind: typeof IpcMessageKind.Response;
	id: number;
	result?: unknown;
	error?: IpcErrorData;
}

export interface IpcNotificationMessage {
	kind: typeof IpcMessageKind.Notification;
	method: string;
	data?: unknown;
}

export type IpcMessage = IpcRequestMessage | IpcResponseMessage | IpcNotificationMessage;

export interface IpcRequestContext {
	deadline?: number;
}

export type IpcRequestHandler = (data: unknown, context: IpcRequestContext) => unknown | Promise<unknown>;
export type IpcFallbackRequestHandler = (
	method: string,
	data: unknown,
	context: IpcRequestContext,
) => unknown | Promise<unknown>;
export type IpcNotificationHandler = (data: unknown) => void | Promise<void>;
export type IpcFallbackNotificationHandler = (method: string, data: unknown) => void | Promise<void>;

export type SendIpcMessage = (message: IpcMessage) => IpcMessage | undefined | Promise<IpcMessage | undefined>;

export interface IpcConnection {
	sendRequest(method: string, data?: unknown, deadline?: number): Promise<unknown>;
	sendNotification(method: string, data?: unknown): Promise<void>;
	onRequest(method: string, handler: IpcRequestHandler): Disposable;
	onRequest(handler: IpcFallbackRequestHandler): Disposable;
	onNotification(method: string, handler: IpcNotificationHandler): Disposable;
	onNotification(handler: IpcFallbackNotificationHandler): Disposable;
	onDispose(handler: () => void): Disposable;
	receive(message: IpcMessage): Promise<IpcResponseMessage | undefined>;
	dispose(): void;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: unknown) => void;
	timeoutId?: ReturnType<typeof globalThis.setTimeout>;
}

export class IpcError<TData = unknown> extends Error {
	public readonly [ipcErrorMarker] = true;

	public constructor(
		public readonly code: number,
		message: string,
		public readonly data?: TData,
	) {
		super(message);
		this.name = "IpcError";
	}
}

class DefaultIpcConnection implements IpcConnection {
	private readonly pendingRequests = new Map<number, PendingRequest>();
	private readonly requestHandlers = new Map<string, IpcRequestHandler>();
	private readonly notificationHandlers = new Map<string, IpcNotificationHandler>();
	private readonly disposeHandlers = new Set<() => void>();
	private fallbackRequestHandler?: IpcFallbackRequestHandler;
	private fallbackNotificationHandler?: IpcFallbackNotificationHandler;
	private nextRequestId = 1;
	private disposed = false;

	public constructor(private readonly sendMessage: SendIpcMessage) {}

	public sendRequest(method: string, data?: unknown, deadline?: number): Promise<unknown> {
		if (this.disposed) return Promise.reject(createConnectionDisposedError());
		if (deadline !== undefined && deadline <= Date.now()) return Promise.reject(createTimeoutError(method));

		const id = this.allocateRequestId();
		const message: IpcRequestMessage = {
			kind: IpcMessageKind.Request,
			id,
			method,
			...(data === undefined ? {} : { data }),
			...(deadline === undefined ? {} : { deadline }),
		};

		return new Promise((resolve, reject) => {
			const pending: PendingRequest = { resolve, reject };
			if (deadline !== undefined) {
				pending.timeoutId = globalThis.setTimeout(
					() => this.rejectPendingRequest(id, createTimeoutError(method)),
					Math.min(Math.max(0, deadline - Date.now()), 2_147_483_647),
				);
			}
			this.pendingRequests.set(id, pending);

			void this.dispatchMessage(message).catch((error) => {
				this.rejectPendingRequest(id, error);
			});
		});
	}

	public async sendNotification(method: string, data?: unknown): Promise<void> {
		if (this.disposed) throw createConnectionDisposedError();
		await this.dispatchMessage({
			kind: IpcMessageKind.Notification,
			method,
			...(data === undefined ? {} : { data }),
		});
	}

	public onRequest(method: string, handler: IpcRequestHandler): Disposable;
	public onRequest(handler: IpcFallbackRequestHandler): Disposable;
	public onRequest(methodOrHandler: string | IpcFallbackRequestHandler, handler?: IpcRequestHandler): Disposable {
		if (typeof methodOrHandler === "string") {
			if (!handler) throw new Error("具名 IPC request handler 不能为空");
			this.requestHandlers.set(methodOrHandler, handler);
			return createDisposable(() => {
				if (this.requestHandlers.get(methodOrHandler) === handler) this.requestHandlers.delete(methodOrHandler);
			});
		}

		this.fallbackRequestHandler = methodOrHandler;
		return createDisposable(() => {
			if (this.fallbackRequestHandler === methodOrHandler) this.fallbackRequestHandler = undefined;
		});
	}

	public onNotification(method: string, handler: IpcNotificationHandler): Disposable;
	public onNotification(handler: IpcFallbackNotificationHandler): Disposable;
	public onNotification(
		methodOrHandler: string | IpcFallbackNotificationHandler,
		handler?: IpcNotificationHandler,
	): Disposable {
		if (typeof methodOrHandler === "string") {
			if (!handler) throw new Error("具名 IPC notification handler 不能为空");
			this.notificationHandlers.set(methodOrHandler, handler);
			return createDisposable(() => {
				if (this.notificationHandlers.get(methodOrHandler) === handler) {
					this.notificationHandlers.delete(methodOrHandler);
				}
			});
		}

		this.fallbackNotificationHandler = methodOrHandler;
		return createDisposable(() => {
			if (this.fallbackNotificationHandler === methodOrHandler) this.fallbackNotificationHandler = undefined;
		});
	}

	public onDispose(handler: () => void): Disposable {
		if (this.disposed) {
			handler();
			return createDisposable(() => undefined);
		}

		this.disposeHandlers.add(handler);
		return createDisposable(() => this.disposeHandlers.delete(handler));
	}

	public async receive(message: IpcMessage): Promise<IpcResponseMessage | undefined> {
		if (this.disposed) return undefined;

		switch (message.kind) {
			case IpcMessageKind.Response:
				this.receiveResponse(message);
				return undefined;
			case IpcMessageKind.Notification:
				this.receiveNotification(message);
				return undefined;
			case IpcMessageKind.Request:
				return this.receiveRequest(message);
		}
	}

	public dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		for (const id of this.pendingRequests.keys()) {
			this.rejectPendingRequest(id, createConnectionDisposedError());
		}
		this.requestHandlers.clear();
		this.notificationHandlers.clear();
		this.fallbackRequestHandler = undefined;
		this.fallbackNotificationHandler = undefined;

		for (const handler of this.disposeHandlers) {
			try {
				handler();
			} catch (error) {
				console.error("[poe2-extensions] IPC dispose handler 执行失败", error);
			}
		}
		this.disposeHandlers.clear();
	}

	private async dispatchMessage(message: IpcMessage): Promise<void> {
		const response = await this.sendMessage(message);
		if (response !== undefined) await this.receive(response);
	}

	private async receiveRequest(message: IpcRequestMessage): Promise<IpcResponseMessage> {
		const context: IpcRequestContext = {
			...(message.deadline === undefined ? {} : { deadline: message.deadline }),
		};
		const handler = this.requestHandlers.get(message.method);

		try {
			if (handler) {
				const result = await handler(message.data, context);
				return createSuccessResponse(message.id, result);
			}
			if (this.fallbackRequestHandler) {
				const result = await this.fallbackRequestHandler(message.method, message.data, context);
				return createSuccessResponse(message.id, result);
			}
			throw new IpcError(IpcErrorCode.MethodNotFound, `IPC 方法不存在: ${message.method}`);
		} catch (error) {
			return {
				kind: IpcMessageKind.Response,
				id: message.id,
				error: serializeIpcError(error),
			};
		}
	}

	private receiveNotification(message: IpcNotificationMessage): void {
		const handler = this.notificationHandlers.get(message.method);
		const promise = handler
			? Promise.resolve(handler(message.data))
			: Promise.resolve(this.fallbackNotificationHandler?.(message.method, message.data));
		void promise.catch((error) => {
			console.error(`[poe2-extensions] IPC notification handler 执行失败: ${message.method}`, error);
		});
	}

	private receiveResponse(message: IpcResponseMessage): void {
		const pending = this.takePendingRequest(message.id);
		if (!pending) return;

		if (message.error) {
			pending.reject(new IpcError(message.error.code, message.error.message, message.error.data));
			return;
		}
		pending.resolve(message.result);
	}

	private rejectPendingRequest(id: number, error: unknown): void {
		this.takePendingRequest(id)?.reject(error);
	}

	private takePendingRequest(id: number): PendingRequest | undefined {
		const pending = this.pendingRequests.get(id);
		if (!pending) return undefined;
		this.pendingRequests.delete(id);
		if (pending.timeoutId !== undefined) globalThis.clearTimeout(pending.timeoutId);
		return pending;
	}

	private allocateRequestId(): number {
		const start = this.nextRequestId;
		do {
			const id = this.nextRequestId;
			this.nextRequestId = id >= Number.MAX_SAFE_INTEGER ? 1 : id + 1;
			if (!this.pendingRequests.has(id)) return id;
		} while (this.nextRequestId !== start);

		throw new IpcError(IpcErrorCode.InternalError, "IPC request ID 已耗尽");
	}
}

export function createIpcConnection(sendMessage: SendIpcMessage): IpcConnection {
	return new DefaultIpcConnection(sendMessage);
}

export function isIpcMessage(value: unknown): value is IpcMessage {
	if (!isRecord(value)) return false;

	switch (value.kind) {
		case IpcMessageKind.Request:
			return (
				isRequestId(value.id)
				&& typeof value.method === "string"
				&& (value.deadline === undefined
					|| (typeof value.deadline === "number" && Number.isFinite(value.deadline)))
			);
		case IpcMessageKind.Response:
			return (
				isRequestId(value.id)
				&& (value.error === undefined || isIpcErrorData(value.error))
				&& !(value.error !== undefined && "result" in value)
			);
		case IpcMessageKind.Notification:
			return typeof value.method === "string";
		default:
			return false;
	}
}

function createSuccessResponse(id: number, result: unknown): IpcResponseMessage {
	return {
		kind: IpcMessageKind.Response,
		id,
		...(result === undefined ? {} : { result }),
	};
}

function serializeIpcError(error: unknown): IpcErrorData {
	if (isIpcError(error)) {
		return {
			code: error.code,
			message: error.message,
			...(error.data === undefined ? {} : { data: error.data }),
		};
	}
	return {
		code: IpcErrorCode.InternalError,
		message: error instanceof Error ? error.message : "未知 IPC 错误",
	};
}

function isIpcError(value: unknown): value is IpcError {
	return (
		value instanceof Error
		&& (value as IpcError)[ipcErrorMarker] === true
		&& typeof (value as IpcError).code === "number"
	);
}

function createTimeoutError(method: string): IpcError {
	return new IpcError(IpcErrorCode.Timeout, `IPC 请求超时: ${method}`);
}

function createConnectionDisposedError(): IpcError {
	return new IpcError(IpcErrorCode.ConnectionDisposed, "IPC 连接已关闭");
}

function createDisposable(dispose: () => void): Disposable {
	let disposed = false;
	return {
		dispose() {
			if (disposed) return;
			disposed = true;
			dispose();
		},
	};
}

function isIpcErrorData(value: unknown): value is IpcErrorData {
	return isRecord(value) && Number.isSafeInteger(value.code) && typeof value.message === "string";
}

function isRequestId(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
