import {
	CancellationTokenSource,
	ResponseError,
	type CancellationToken,
	type Disposable,
	type MessageConnection,
} from "vscode-jsonrpc/browser";

const ipcRequestTimeoutErrorCode = -32_000;

type RequestHandler = (params: unknown, token: CancellationToken) => unknown | Promise<unknown>;
type NotificationHandler = (params: unknown) => void | Promise<void>;

interface RegisteredHandler<THandler> {
	handler: THandler;
	disposables: Map<MessageConnection, Disposable>;
}

// 一个通道可以连接多个对端；已有 handler 会自动挂载到后续建立的连接。
export class IpcConnectionHub<TAddress> {
	private readonly connections = new Set<MessageConnection>();
	private readonly requestHandlers = new Map<string, RegisteredHandler<RequestHandler>>();
	private readonly notificationHandlers = new Map<string, RegisteredHandler<NotificationHandler>>();

	public constructor(private readonly resolveConnection: (address: TAddress) => MessageConnection) {}

	public addConnection(connection: MessageConnection): () => void {
		if (this.connections.has(connection)) return () => undefined;

		this.connections.add(connection);
		for (const [method, registration] of this.requestHandlers) {
			registration.disposables.set(connection, connection.onRequest(method, registration.handler));
		}
		for (const [method, registration] of this.notificationHandlers) {
			registration.disposables.set(connection, connection.onNotification(method, registration.handler));
		}

		return () => {
			this.connections.delete(connection);
			for (const registration of this.requestHandlers.values()) {
				registration.disposables.get(connection)?.dispose();
				registration.disposables.delete(connection);
			}
			for (const registration of this.notificationHandlers.values()) {
				registration.disposables.get(connection)?.dispose();
				registration.disposables.delete(connection);
			}
		};
	}

	public addRelay(sourceConnection: MessageConnection, targetAddress: TAddress): () => void {
		const requestDisposable = sourceConnection.onRequest((method, params, token) => {
			const targetConnection = this.resolveConnection(targetAddress);
			return params === undefined
				? targetConnection.sendRequest(method, token)
				: targetConnection.sendRequest(method, params, token);
		});
		const notificationDisposable = sourceConnection.onNotification((method, params) => {
			const targetConnection = this.resolveConnection(targetAddress);
			return params === undefined
				? targetConnection.sendNotification(method)
				: targetConnection.sendNotification(method, params);
		});

		return () => {
			requestDisposable.dispose();
			notificationDisposable.dispose();
		};
	}

	public async invoke(
		address: TAddress,
		method: string,
		params: unknown | undefined,
		timeoutMs: number,
	): Promise<unknown> {
		const connection = this.resolveConnection(address);
		const cancellation = new CancellationTokenSource();
		const timeoutId = globalThis.setTimeout(() => cancellation.cancel(), timeoutMs);

		try {
			return params === undefined
				? await connection.sendRequest(method, cancellation.token)
				: await connection.sendRequest(method, params, cancellation.token);
		} catch (error) {
			if (cancellation.token.isCancellationRequested) {
				throw new ResponseError(ipcRequestTimeoutErrorCode, `IPC 请求超时: ${method}`);
			}
			throw error;
		} finally {
			globalThis.clearTimeout(timeoutId);
			cancellation.dispose();
		}
	}

	public send(address: TAddress, method: string, data: unknown | undefined): Promise<void> {
		const connection = this.resolveConnection(address);
		return data === undefined ? connection.sendNotification(method) : connection.sendNotification(method, data);
	}

	public handle(method: string, handler: RequestHandler): () => void {
		this.requestHandlers.get(method)?.disposables.forEach((disposable) => disposable.dispose());
		const registration: RegisteredHandler<RequestHandler> = {
			handler,
			disposables: new Map(),
		};
		this.requestHandlers.set(method, registration);
		for (const connection of this.connections) {
			registration.disposables.set(connection, connection.onRequest(method, handler));
		}

		return () => {
			if (this.requestHandlers.get(method) !== registration) return;
			registration.disposables.forEach((disposable) => disposable.dispose());
			this.requestHandlers.delete(method);
		};
	}

	public on(method: string, handler: NotificationHandler): () => void {
		this.notificationHandlers.get(method)?.disposables.forEach((disposable) => disposable.dispose());
		const registration: RegisteredHandler<NotificationHandler> = {
			handler,
			disposables: new Map(),
		};
		this.notificationHandlers.set(method, registration);
		for (const connection of this.connections) {
			registration.disposables.set(connection, connection.onNotification(method, handler));
		}

		return () => {
			if (this.notificationHandlers.get(method) !== registration) return;
			registration.disposables.forEach((disposable) => disposable.dispose());
			this.notificationHandlers.delete(method);
		};
	}
}
