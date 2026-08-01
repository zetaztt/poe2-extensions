import type { Disposable, IpcConnection, IpcRequestContext } from "./ipc-connection";
// 全局发布使用内部 envelope；普通 notification 保持点对点，显式寻址不会被 relay 扩散。
const ipcPublishedNotificationMethod = "$/ipc/publish";
const maxRememberedPublishedNotifications = 256;

type RequestHandler<TAddress> = (
	address: TAddress,
	params: unknown,
	context: IpcRequestContext,
) => unknown | Promise<unknown>;
type NotificationHandler<TAddress> = (address: TAddress, params: unknown) => void | Promise<void>;
type IpcAddressArguments<TAddress> = [TAddress] extends [void] ? [] : [address: TAddress];

interface RegisteredHandler<THandler> {
	handler: THandler;
	disposables: Map<IpcConnection, Disposable>;
}

interface PublishedNotification {
	id: string;
	method: string;
	data?: unknown;
}

/**
 * 聚合一个 channel 的多个连接，并将 handler、通知发布和 relay 应用于整个连接拓扑。
 */
export class IpcConnectionHub<TAddress> {
	private readonly connections = new Set<IpcConnection>();
	private readonly connectionAddresses = new Map<IpcConnection, TAddress>();
	private readonly requestHandlers = new Map<string, RegisteredHandler<RequestHandler<TAddress>>>();
	private readonly notificationHandlers = new Map<string, RegisteredHandler<NotificationHandler<TAddress>>>();
	private readonly publishedNotificationDisposables = new Map<IpcConnection, Disposable>();
	// relay target 可能是惰性 runtime 连接，首次发布经过 source 时才需要解析并加入拓扑。
	private readonly relayTargets = new Map<IpcConnection, Set<TAddress>>();
	// 同一发布可能经多个 content/window 路径返回，有限 ID 集合确保每个环境只处理一次。
	private readonly publishedNotificationIds = new Set<string>();
	private readonly publishedNotificationIdOrder: string[] = [];

	public constructor(private readonly resolveConnection: (address: TAddress) => IpcConnection) {}

	/**
	 * 注册现有连接；有地址 hub 同时记录该连接对应的通知和请求来源。
	 */
	public addConnection(connection: IpcConnection, ...args: IpcAddressArguments<TAddress>): () => void {
		return this.registerConnection(connection, args.length > 0, args[0] as TAddress);
	}

	private registerConnection(connection: IpcConnection, hasAddress: boolean, address?: TAddress): () => void {
		// relay source 不代表可寻址对端；单独传 hasAddress 可区分“地址值为 undefined”和“没有来源地址”。
		if (hasAddress) this.connectionAddresses.set(connection, address as TAddress);
		if (this.connections.has(connection)) return () => undefined;

		this.connections.add(connection);
		for (const [method, registration] of this.requestHandlers) {
			registration.disposables.set(
				connection,
				this.installRequestHandler(connection, method, registration.handler),
			);
		}
		for (const [method, registration] of this.notificationHandlers) {
			registration.disposables.set(
				connection,
				this.installNotificationHandler(connection, method, registration.handler),
			);
		}
		this.publishedNotificationDisposables.set(
			connection,
			connection.onNotification(ipcPublishedNotificationMethod, (value) =>
				this.receivePublishedNotification(connection, value),
			),
		);

		return () => {
			this.connections.delete(connection);
			this.connectionAddresses.delete(connection);
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

	/**
	 * 将 source 上未被本地处理的调用转发到按地址惰性解析的目标连接。
	 */
	public addRelay(sourceConnection: IpcConnection, targetAddress: TAddress): () => void {
		this.registerConnection(sourceConnection, false);
		const targets = this.relayTargets.get(sourceConnection) ?? new Set<TAddress>();
		targets.add(targetAddress);
		this.relayTargets.set(sourceConnection, targets);

		const requestDisposable = sourceConnection.onRequest((method, params, context) => {
			const targetConnection = this.getConnection(targetAddress);
			return targetConnection.sendRequest(method, params, context.deadline);
		});
		const notificationDisposable = sourceConnection.onNotification((method, params) => {
			if (method === ipcPublishedNotificationMethod) return undefined;
			const targetConnection = this.getConnection(targetAddress);
			return targetConnection.sendNotification(method, params);
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
		return connection.sendRequest(method, params, Date.now() + timeoutMs);
	}

	public send(address: TAddress, method: string, data: unknown | undefined): Promise<void> {
		const connection = this.getConnection(address);
		return data === undefined ? connection.sendNotification(method) : connection.sendNotification(method, data);
	}

	/**
	 * 在本地分发后沿全部连接和 relay 扩散 notification，并使用发布 ID 抑制环路重复。
	 */
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

	/**
	 * 注册应用于现有及后续连接的 RPC handler；同 method 后注册者替换旧 handler。
	 */
	public handle(method: string, handler: RequestHandler<TAddress>): () => void {
		this.requestHandlers.get(method)?.disposables.forEach((disposable) => disposable.dispose());
		const registration: RegisteredHandler<RequestHandler<TAddress>> = {
			handler,
			disposables: new Map(),
		};
		this.requestHandlers.set(method, registration);
		for (const connection of this.connections) {
			registration.disposables.set(connection, this.installRequestHandler(connection, method, handler));
		}

		return () => {
			if (this.requestHandlers.get(method) !== registration) return;
			registration.disposables.forEach((disposable) => disposable.dispose());
			this.requestHandlers.delete(method);
		};
	}

	/**
	 * 注册应用于现有及后续连接的 notification handler；同 method 后注册者替换旧 handler。
	 */
	public on(method: string, handler: NotificationHandler<TAddress>): () => void {
		this.notificationHandlers.get(method)?.disposables.forEach((disposable) => disposable.dispose());
		const registration: RegisteredHandler<NotificationHandler<TAddress>> = {
			handler,
			disposables: new Map(),
		};
		this.notificationHandlers.set(method, registration);
		for (const connection of this.connections) {
			registration.disposables.set(connection, this.installNotificationHandler(connection, method, handler));
		}

		return () => {
			if (this.notificationHandlers.get(method) !== registration) return;
			registration.disposables.forEach((disposable) => disposable.dispose());
			this.notificationHandlers.delete(method);
		};
	}

	private getConnection(address: TAddress): IpcConnection {
		const connection = this.resolveConnection(address);
		this.registerConnection(connection, true, address);
		return connection;
	}

	private installRequestHandler(
		connection: IpcConnection,
		method: string,
		handler: RequestHandler<TAddress>,
	): Disposable {
		return connection.onRequest(method, (params, context) => {
			return handler(this.connectionAddresses.get(connection) as TAddress, params, context);
		});
	}

	private installNotificationHandler(
		connection: IpcConnection,
		method: string,
		handler: NotificationHandler<TAddress>,
	): Disposable {
		return connection.onNotification(method, (params) => {
			return handler(this.connectionAddresses.get(connection) as TAddress, params);
		});
	}

	private async receivePublishedNotification(source: IpcConnection, value: unknown): Promise<void> {
		if (!isPublishedNotification(value) || this.publishedNotificationIds.has(value.id)) return;

		this.rememberPublishedNotification(value.id);
		await Promise.allSettled([
			this.dispatchPublishedNotification(value, source),
			this.forwardPublishedNotification(value, source),
		]);
	}

	private dispatchPublishedNotification(notification: PublishedNotification, source?: IpcConnection): Promise<void> {
		const handler = this.notificationHandlers.get(notification.method)?.handler;
		// 本地产生的无地址发布没有 source；void channel 的 listener 签名会在门面层移除该占位参数。
		return Promise.resolve(
			handler?.(this.connectionAddresses.get(source as IpcConnection) as TAddress, notification.data),
		);
	}

	private async forwardPublishedNotification(
		notification: PublishedNotification,
		source?: IpcConnection,
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
