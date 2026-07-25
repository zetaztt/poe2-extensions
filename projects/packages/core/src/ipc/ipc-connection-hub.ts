import {
	CancellationTokenSource,
	ResponseError,
	type CancellationToken,
	type Disposable,
	type MessageConnection,
} from "vscode-jsonrpc/browser";

const ipcRequestTimeoutErrorCode = -32_000;
// 全局发布使用内部 envelope；普通 notification 保持点对点，显式寻址不会被 relay 扩散。
const ipcPublishedNotificationMethod = "$/ipc/publish";
const maxRememberedPublishedNotifications = 256;

type RequestHandler = (params: unknown, token: CancellationToken) => unknown | Promise<unknown>;
type NotificationHandler = (params: unknown) => void | Promise<void>;

interface RegisteredHandler<THandler> {
	handler: THandler;
	disposables: Map<MessageConnection, Disposable>;
}

interface PublishedNotification {
	id: string;
	method: string;
	data?: unknown;
}

// 一个通道可以连接多个对端；已有 handler 会自动挂载到后续建立的连接。
export class IpcConnectionHub<TAddress> {
	private readonly connections = new Set<MessageConnection>();
	private readonly requestHandlers = new Map<string, RegisteredHandler<RequestHandler>>();
	private readonly notificationHandlers = new Map<string, RegisteredHandler<NotificationHandler>>();
	private readonly publishedNotificationDisposables = new Map<MessageConnection, Disposable>();
	// relay target 可能是惰性 runtime 连接，首次发布经过 source 时才需要解析并加入拓扑。
	private readonly relayTargets = new Map<MessageConnection, Set<TAddress>>();
	// 同一发布可能经多个 content/window 路径返回，有限 ID 集合确保每个环境只处理一次。
	private readonly publishedNotificationIds = new Set<string>();
	private readonly publishedNotificationIdOrder: string[] = [];

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
		this.publishedNotificationDisposables.set(
			connection,
			connection.onNotification(ipcPublishedNotificationMethod, (value) =>
				this.receivePublishedNotification(connection, value),
			),
		);

		return () => {
			this.connections.delete(connection);
			this.relayTargets.delete(connection);
			this.publishedNotificationDisposables.get(connection)?.dispose();
			this.publishedNotificationDisposables.delete(connection);
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
		this.addConnection(sourceConnection);
		const targets = this.relayTargets.get(sourceConnection) ?? new Set<TAddress>();
		targets.add(targetAddress);
		this.relayTargets.set(sourceConnection, targets);

		const requestDisposable = sourceConnection.onRequest((method, params, token) => {
			const targetConnection = this.getConnection(targetAddress);
			return params === undefined
				? targetConnection.sendRequest(method, token)
				: targetConnection.sendRequest(method, params, token);
		});
		const notificationDisposable = sourceConnection.onNotification((method, params) => {
			if (method === ipcPublishedNotificationMethod) return undefined;
			const targetConnection = this.getConnection(targetAddress);
			return params === undefined
				? targetConnection.sendNotification(method)
				: targetConnection.sendNotification(method, params);
		});

		return () => {
			requestDisposable.dispose();
			notificationDisposable.dispose();
			targets.delete(targetAddress);
			if (targets.size === 0) this.relayTargets.delete(sourceConnection);
		};
	}

	public async invoke(
		address: TAddress,
		method: string,
		params: unknown | undefined,
		timeoutMs: number,
	): Promise<unknown> {
		const connection = this.getConnection(address);
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
		const connection = this.getConnection(address);
		return data === undefined ? connection.sendNotification(method) : connection.sendNotification(method, data);
	}

	public async publish(method: string, data: unknown | undefined): Promise<void> {
		const notification: PublishedNotification = {
			id: createPublishedNotificationId(),
			method,
			...(data === undefined ? {} : { data }),
		};
		this.rememberPublishedNotification(notification.id);
		await Promise.allSettled([
			this.dispatchPublishedNotification(notification),
			this.forwardPublishedNotification(notification),
		]);
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

	private getConnection(address: TAddress): MessageConnection {
		const connection = this.resolveConnection(address);
		this.addConnection(connection);
		return connection;
	}

	private async receivePublishedNotification(source: MessageConnection, value: unknown): Promise<void> {
		if (!isPublishedNotification(value) || this.publishedNotificationIds.has(value.id)) return;

		this.rememberPublishedNotification(value.id);
		await Promise.allSettled([
			this.dispatchPublishedNotification(value),
			this.forwardPublishedNotification(value, source),
		]);
	}

	private dispatchPublishedNotification(notification: PublishedNotification): Promise<void> {
		const handler = this.notificationHandlers.get(notification.method)?.handler;
		return Promise.resolve(handler?.(notification.data));
	}

	private async forwardPublishedNotification(
		notification: PublishedNotification,
		source?: MessageConnection,
	): Promise<void> {
		const targetConnections = new Set(this.connections);
		const routeEntries = source
			? [[source, this.relayTargets.get(source)] as const]
			: Array.from(this.relayTargets.entries());
		for (const [, targetAddresses] of routeEntries) {
			if (!targetAddresses) continue;
			for (const address of targetAddresses) targetConnections.add(this.getConnection(address));
		}

		if (source) targetConnections.delete(source);
		const notifications: Promise<void>[] = [];
		for (const connection of targetConnections) {
			notifications.push(connection.sendNotification(ipcPublishedNotificationMethod, notification));
		}
		await Promise.allSettled(notifications);
	}

	private rememberPublishedNotification(id: string): void {
		this.publishedNotificationIds.add(id);
		this.publishedNotificationIdOrder.push(id);
		if (this.publishedNotificationIdOrder.length <= maxRememberedPublishedNotifications) return;

		const expiredId = this.publishedNotificationIdOrder.shift();
		if (expiredId) this.publishedNotificationIds.delete(expiredId);
	}
}

function isPublishedNotification(value: unknown): value is PublishedNotification {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const notification = value as { id?: unknown; method?: unknown };
	return typeof notification.id === "string" && typeof notification.method === "string";
}

function createPublishedNotificationId(): string {
	if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
