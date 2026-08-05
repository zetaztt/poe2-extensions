import assert from "node:assert/strict";
import { test } from "node:test";
import type { ipcMain as backgroundIpcMain } from "../../projects/apps/background/src/background-ipc-channels";
import { createMainWorldIpcMain } from "../../projects/apps/inject/src/inject-ipc-adapter";
import type { ipcMain as injectIpcMain } from "../../projects/apps/inject/src/inject-ipc-channels";
import type { ipcMain as sidePanelIpcMain } from "../../projects/apps/side-panel/src/side-panel-ipc-channels";
import { Result } from "@poe2-extensions/core/result";
import {
	createIpcEnvelope,
	defineIpcProtocol,
	defineNotification,
	defineRpc,
	IpcChannel,
	IpcConnectionHub,
	installIpcEnvelopeRelay,
	IpcError,
	IpcErrorCode,
	IpcHandlerChannel,
	IpcHandlerConnectionHub,
	IpcMessageKind,
	IpcRole,
	isIpcEnvelope,
	isIpcMessage,
	type IpcConnectionHubOptions,
	type IpcEnvelope,
	type IpcMessage,
	type IpcMessageConnectionAdapter,
	type IpcRequestMessage,
} from "@poe2-extensions/core/ipc";

interface HubOptionsPair {
	left: IpcConnectionHubOptions;
	right: IpcConnectionHubOptions;
	leftSent: IpcEnvelope[];
	rightSent: IpcEnvelope[];
}

const channelTestProtocol = defineIpcProtocol({
	name: "channel-test",
	echo: defineRpc<{ value: string }, string>(),
	changed: defineNotification<{ value: string }>(),
});

test("Result 使用 ok 判别成功值与显式错误", () => {
	const empty = Result.ok();
	const success: Result<string, Error> = Result.ok("value");
	const failure: Result<string, Error> = Result.err(new Error("failed"));
	const read = (result: Result<string, Error>) => (Result.isOk(result) ? result.value : result.error.message);

	assert.equal(empty.ok, true);
	assert.equal(empty.value, undefined);
	assert.equal(read(success), "value");
	assert.equal(read(failure), "failed");
});

test("持有 channel 的运行环境只向 RPC 服务端公开 handle", () => {
	type HasHandle<T> = "handle" extends keyof T ? true : false;
	const hubCapabilities = {
		connection: false satisfies HasHandle<IpcConnectionHub>,
		handlerConnection: true satisfies HasHandle<IpcHandlerConnectionHub>,
	};
	const capabilities = {
		background: true satisfies HasHandle<typeof backgroundIpcMain>,
		inject: false satisfies HasHandle<typeof injectIpcMain>,
		"side-panel": false satisfies HasHandle<typeof sidePanelIpcMain>,
	};

	assert.deepEqual(hubCapabilities, {
		connection: false,
		handlerConnection: true,
	});
	assert.deepEqual(capabilities, {
		background: true,
		inject: false,
		"side-panel": false,
	});
});

test("IpcChannel 构造时各自持有独立 hub", () => {
	const pair = createHubOptionsPair();
	let factoryCalls = 0;
	const factory = () => {
		factoryCalls += 1;
		return new IpcConnectionHub(pair.left);
	};

	const firstChannel = new IpcChannel(factory());
	const secondChannel = new IpcChannel(factory());

	assert.equal(factoryCalls, 2);
	assert.notEqual(Reflect.get(firstChannel, "backend"), Reflect.get(secondChannel, "backend"));
});

test("IpcConnectionHub 以原始业务 notification 直达 adapter", async () => {
	const sent: IpcEnvelope[] = [];
	const locallyReceived: unknown[] = [];
	const hub = new IpcConnectionHub({
		role: IpcRole.Client,
		adapter: {
			sendMessage(envelope) {
				sent.push(envelope);
				return Promise.resolve(undefined);
			},
			addMessageListener() {},
		},
	});
	hub.on(channelTestProtocol.changed.method, (data) => {
		locallyReceived.push(data);
	});

	await hub.send(channelTestProtocol.changed.method, { value: "direct" });

	assert.deepEqual(locallyReceived, [{ value: "direct" }]);
	assert.deepEqual(sent, [
		createIpcEnvelope(IpcRole.Client, {
			kind: IpcMessageKind.Notification,
			method: channelTestProtocol.changed.method,
			data: { value: "direct" },
		}),
	]);
});

test("独立 client Hub 分别接收广播通知并隔离并行 RPC 响应", async () => {
	const listeners: Array<(value: unknown) => unknown> = [];
	const requests: IpcRequestMessage[] = [];
	const createClient = () =>
		new IpcConnectionHub({
			role: IpcRole.Client,
			adapter: {
				sendMessage(envelope) {
					if (envelope.message.kind === IpcMessageKind.Request) requests.push(envelope.message);
					return Promise.resolve(undefined);
				},
				addMessageListener(listener) {
					listeners.push(listener);
				},
			},
		});
	const first = createClient();
	const second = createClient();
	const firstNotifications: string[] = [];
	const secondNotifications: string[] = [];
	first.on(channelTestProtocol.changed.method, (data) => {
		firstNotifications.push((data as { value: string }).value);
	});
	second.on(channelTestProtocol.changed.method, (data) => {
		secondNotifications.push((data as { value: string }).value);
	});

	for (const listener of listeners) {
		await listener(
			createIpcEnvelope(IpcRole.Server, {
				kind: IpcMessageKind.Notification,
				method: channelTestProtocol.changed.method,
				data: { value: "broadcast" },
			}),
		);
	}
	assert.deepEqual(firstNotifications, ["broadcast"]);
	assert.deepEqual(secondNotifications, ["broadcast"]);

	const firstRequest = first.invoke(channelTestProtocol.echo.method, { value: "first" }, 1_000);
	const secondRequest = second.invoke(channelTestProtocol.echo.method, { value: "second" }, 1_000);
	assert.equal(requests.length, 2);
	assert.notEqual(requests[0].id, requests[1].id);

	for (const request of requests) {
		for (const listener of listeners) {
			await listener(
				createIpcEnvelope(IpcRole.Server, {
					kind: IpcMessageKind.Response,
					id: request.id,
					result: request.id,
				}),
			);
		}
	}
	assert.equal(await firstRequest, requests[0].id);
	assert.equal(await secondRequest, requests[1].id);
});

test("Runtime adapter 仅由 server 广播，client 只直连 background", async () => {
	const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
	const originalConsoleWarn = console.warn;
	const calls: Array<{ type: "query" | "runtime" | "tab"; tabId?: number }> = [];
	let runtimeListener: ((message: unknown) => unknown) | undefined;
	let queryError: Error | undefined;
	const mockChrome = {
		runtime: {
			id: "test-extension",
			lastError: undefined,
			onMessage: {
				addListener(listener: (message: unknown) => unknown) {
					runtimeListener = listener;
				},
			},
			sendMessage(...args: unknown[]) {
				calls.push({ type: "runtime" });
				(args.at(-1) as () => void)();
			},
		},
		tabs: {
			query(_query: unknown, callback: (tabs: Array<{ id?: number }>) => void) {
				calls.push({ type: "query" });
				if (queryError) throw queryError;
				callback([{ id: 41 }, {}, { id: 42 }]);
			},
			sendMessage(...args: unknown[]) {
				calls.push({ type: "tab", tabId: args[0] as number });
				(args.at(-1) as () => void)();
			},
		},
	};
	Object.defineProperty(globalThis, "chrome", { configurable: true, value: mockChrome });
	console.warn = () => {};

	try {
		const { createBackgroundIpcMain } = await import("../../projects/apps/background/src/background-ipc-adapter");
		const { createRuntimeIpcMain } = await import("../../projects/apps/side-panel/src/side-panel-ipc-adapter");
		const server = createBackgroundIpcMain();

		await server.send("all-tabs", undefined);
		assert.deepEqual(calls, [
			{ type: "query" },
			{ type: "runtime" },
			{ type: "tab", tabId: 41 },
			{ type: "tab", tabId: 42 },
		]);

		calls.length = 0;
		runtimeListener?.({ kind: "incoming" });
		assert.deepEqual(calls, []);

		const client = createRuntimeIpcMain();
		await client.send("to-background-only", undefined);
		assert.deepEqual(calls, [{ type: "runtime" }]);

		calls.length = 0;
		queryError = new Error("query failed");
		await server.send("all-tabs", undefined);
		assert.deepEqual(calls, [{ type: "query" }, { type: "runtime" }]);
	} finally {
		console.warn = originalConsoleWarn;
		if (originalChrome) Object.defineProperty(globalThis, "chrome", originalChrome);
		else Reflect.deleteProperty(globalThis, "chrome");
	}
});

test("共享 v8 envelope 校验 source 并拒绝旧版或 target envelope", () => {
	const envelope = createIpcEnvelope(IpcRole.Server, {
		kind: IpcMessageKind.Notification,
		method: "changed",
	});

	assert.equal(isIpcEnvelope(envelope, IpcRole.Server), true);
	assert.equal(isIpcEnvelope(envelope, IpcRole.Client), false);
	assert.equal(
		isIpcEnvelope({ ...envelope, version: "poe2-extensions:ipc:6", target: "clients" }, IpcRole.Server),
		false,
	);
	assert.equal(
		isIpcEnvelope(
			{
				version: "poe2-extensions:ipc:7",
				target: "server",
				message: envelope.message,
			},
			IpcRole.Server,
		),
		false,
	);
	assert.equal(
		isIpcEnvelope(
			{
				channel: "poe2-extensions:ipc:main:v1",
				direction: "content-to-main",
				message: envelope.message,
			},
			IpcRole.Server,
		),
		false,
	);
});

test("MAIN world 内联 Window adapter 完成双向通信并过滤自身消息", async () => {
	const restoreWindow = installFakeWindow();
	const server = new IpcHandlerConnectionHub({
		role: IpcRole.Server,
		adapter: {
			sendMessage(envelope) {
				window.postMessage(envelope, window.location.origin);
				return Promise.resolve(undefined);
			},
			addMessageListener(listener) {
				window.addEventListener("message", (event: MessageEvent<unknown>) => {
					if (event.source !== window || event.origin !== window.location.origin) return;
					void Promise.resolve(listener(event.data)).then((response) => {
						if (response !== undefined) window.postMessage(response, window.location.origin);
					});
				});
			},
		},
	});

	const client = createMainWorldIpcMain();

	try {
		server.handle(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
		assert.equal(await client.invoke(channelTestProtocol.echo.method, { value: "main" }, 1_000), "main");

		const clientNotifications: string[] = [];
		client.on(channelTestProtocol.changed.method, (data) => {
			clientNotifications.push((data as { value: string }).value);
		});

		await server.send(channelTestProtocol.changed.method, { value: "to-client" });
		assert.deepEqual(clientNotifications, ["to-client"]);
	} finally {
		restoreWindow();
	}
});

test("IpcHandlerChannel 使用不含 address 的 invoke、send、on 和 handle", async () => {
	const pair = createHubOptionsPair();
	const hub = new IpcHandlerConnectionHub(pair.left);
	const remoteHub = new IpcHandlerConnectionHub(pair.right);
	const channel = new IpcHandlerChannel(hub);

	remoteHub.handle(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
	channel.handle(channelTestProtocol.echo, ({ value }) => value);
	const notifications: string[] = [];
	channel.on(channelTestProtocol.changed, ({ value }) => {
		notifications.push(value);
	});

	assert.equal(await channel.invoke(channelTestProtocol.echo, { value: "invoke" }), "invoke");
	assert.equal(await remoteHub.invoke(channelTestProtocol.echo.method, { value: "handle" }, 1_000), "handle");
	await channel.send(channelTestProtocol.changed, { value: "publish" });
	assert.deepEqual(notifications, ["publish"]);
});

test("IpcHandlerConnectionHub 独立替换并注销 handler", async () => {
	const pair = createHubOptionsPair();
	const hub = new IpcHandlerConnectionHub(pair.left);
	const remoteHub = new IpcConnectionHub(pair.right);

	const disposeFirst = hub.handle(channelTestProtocol.echo.method, () => "first");
	const disposeSecond = hub.handle(channelTestProtocol.echo.method, () => "second");
	disposeFirst();
	assert.equal(await remoteHub.invoke(channelTestProtocol.echo.method, undefined, 1_000), "second");

	disposeSecond();
	await assert.rejects(
		remoteHub.invoke(channelTestProtocol.echo.method, undefined, 1_000),
		(error) =>
			error instanceof IpcError
			&& error.code === IpcErrorCode.MethodNotFound
			&& error.message === `IPC 方法未定义: ${channelTestProtocol.echo.method}`,
	);
});

test("request 支持无参数、undefined result 和并发乱序响应", async () => {
	const sentMessages: IpcMessage[] = [];
	let listener: (value: unknown) => unknown = () => undefined;
	const hub = new IpcConnectionHub({
		role: IpcRole.Client,
		adapter: {
			async sendMessage(envelope) {
				sentMessages.push(envelope.message);
				return undefined;
			},
			addMessageListener(value) {
				listener = value;
			},
		},
	});

	const first = hub.invoke("first", undefined, 1_000);
	const second = hub.invoke("second", { value: 2 }, 1_000);
	const [firstRequest, secondRequest] = sentMessages as IpcRequestMessage[];

	await listener(
		createIpcEnvelope(IpcRole.Server, {
			kind: IpcMessageKind.Response,
			id: secondRequest.id,
			result: "second-result",
		}),
	);
	await listener(
		createIpcEnvelope(IpcRole.Server, {
			kind: IpcMessageKind.Response,
			id: firstRequest.id,
		}),
	);

	assert.equal(await first, undefined);
	assert.equal(await second, "second-result");
	assert.equal("data" in firstRequest, false);
});

test("每个 request 使用独立 UUID", async () => {
	const connectionMessages: IpcRequestMessage[] = [];
	const hub = new IpcConnectionHub({
		role: IpcRole.Client,
		adapter: {
			async sendMessage(envelope) {
				if (envelope.message.kind !== IpcMessageKind.Request) return undefined;
				connectionMessages.push(envelope.message);
				return createIpcEnvelope(IpcRole.Server, {
					kind: IpcMessageKind.Response,
					id: envelope.message.id,
					result: envelope.message.id,
				});
			},
			addMessageListener() {},
		},
	});
	const firstId = (await hub.invoke("first", undefined, 1_000)) as string;
	const secondId = (await hub.invoke("second", undefined, 1_000)) as string;
	const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	assert.match(firstId, uuidPattern);
	assert.match(secondId, uuidPattern);
	assert.notEqual(firstId, secondId);
	assert.deepEqual(
		connectionMessages.map(({ id }) => id),
		[firstId, secondId],
	);
});

test("具名 request、notification 和 handler 注销按预期工作", async () => {
	const pair = createHubOptionsPair();
	const left = new IpcConnectionHub(pair.left);
	const right = new IpcHandlerConnectionHub(pair.right);
	const notifications: unknown[] = [];
	const removeRequest = right.handle("named", (data) => ({ data }));
	const removeNotification = right.on("changed", (data) => {
		notifications.push(data);
	});

	assert.deepEqual(await left.invoke("named", 1, 1_000), { data: 1 });
	await left.send("changed", 3);
	await Promise.resolve();
	assert.deepEqual(notifications, [3]);

	removeRequest();
	removeNotification();
	await assert.rejects(
		left.invoke("named", undefined, 1_000),
		(error) =>
			error instanceof IpcError
			&& error.code === IpcErrorCode.MethodNotFound
			&& error.message === "IPC 方法未定义: named",
	);
});

test("远端 IpcError 保留 code/message/data，普通异常转换为 InternalError", async () => {
	const pair = createHubOptionsPair();
	const left = new IpcConnectionHub(pair.left);
	const right = new IpcHandlerConnectionHub(pair.right);
	right.handle("structured", () => {
		throw new IpcError(42, "结构化错误", { reason: "test" });
	});
	right.handle("plain", () => {
		throw new Error("普通错误");
	});

	await assert.rejects(
		left.invoke("structured", undefined, 1_000),
		(error) =>
			error instanceof IpcError
			&& error.code === 42
			&& error.message === "结构化错误"
			&& assert.deepEqual(error.data, { reason: "test" }) === undefined,
	);
	await assert.rejects(
		left.invoke("plain", undefined, 1_000),
		(error) =>
			error instanceof IpcError && error.code === IpcErrorCode.InternalError && error.message === "普通错误",
	);
});

test("本地超时清理 pending，迟到响应被忽略且不会发送 cancel", async () => {
	const sentMessages: IpcMessage[] = [];
	let listener: (value: unknown) => unknown = () => undefined;
	const hub = new IpcConnectionHub({
		role: IpcRole.Client,
		adapter: {
			async sendMessage(envelope) {
				sentMessages.push(envelope.message);
				return undefined;
			},
			addMessageListener(value) {
				listener = value;
			},
		},
	});
	const request = hub.invoke("slow", undefined, 20);
	const requestMessage = sentMessages[0] as IpcRequestMessage;

	await assert.rejects(request, (error) => error instanceof IpcError && error.code === IpcErrorCode.Timeout);
	assert.deepEqual(
		sentMessages.map((message) => message.kind),
		[IpcMessageKind.Request],
	);

	await listener(
		createIpcEnvelope(IpcRole.Server, {
			kind: IpcMessageKind.Response,
			id: requestMessage.id,
			result: "late",
		}),
	);
	const next = hub.invoke("next", undefined, 1_000);
	const nextMessage = sentMessages[1] as IpcRequestMessage;
	await listener(
		createIpcEnvelope(IpcRole.Server, {
			kind: IpcMessageKind.Response,
			id: nextMessage.id,
			result: "ok",
		}),
	);
	assert.equal(await next, "ok");
});

test("installIpcEnvelopeRelay 分别注册两个方向并原样转发 envelope 和 adapter response", async () => {
	let firstListener: (value: unknown) => unknown = () => undefined;
	let secondListener: (value: unknown) => unknown = () => undefined;
	const firstSent: unknown[] = [];
	const secondSent: unknown[] = [];
	const response = createIpcEnvelope(IpcRole.Server, {
		kind: IpcMessageKind.Response,
		id: "123e4567-e89b-42d3-a456-426614174000",
		result: "relayed",
	});
	let rejectSecondSend = false;
	const firstAdapter: IpcMessageConnectionAdapter = {
		sendMessage(envelope) {
			firstSent.push(envelope);
			return Promise.resolve(undefined);
		},
		addMessageListener(listener) {
			firstListener = listener;
		},
	};
	const secondAdapter: IpcMessageConnectionAdapter = {
		sendMessage(envelope) {
			secondSent.push(envelope);
			return rejectSecondSend ? Promise.reject(new Error("target failed")) : Promise.resolve(response);
		},
		addMessageListener(listener) {
			secondListener = listener;
		},
	};
	installIpcEnvelopeRelay({
		sourceRole: IpcRole.Client,
		adapter: {
			addSourceMessageListener(listener) {
				firstAdapter.addMessageListener(listener);
			},
			sendTargetMessage(envelope) {
				return secondAdapter.sendMessage(envelope);
			},
		},
	});
	installIpcEnvelopeRelay({
		sourceRole: IpcRole.Server,
		adapter: {
			addSourceMessageListener(listener) {
				secondAdapter.addMessageListener(listener);
			},
			sendTargetMessage(envelope) {
				return firstAdapter.sendMessage(envelope);
			},
		},
	});
	const request = createIpcEnvelope(IpcRole.Client, {
		kind: IpcMessageKind.Request,
		id: "123e4567-e89b-42d3-a456-426614174000",
		method: "relayed",
	});

	assert.equal(await firstListener(request), response);
	assert.equal(secondSent[0], request);

	const notification = createIpcEnvelope(IpcRole.Server, {
		kind: IpcMessageKind.Notification,
		method: "changed",
		data: { value: "from-second" },
	});
	await secondListener(notification);
	assert.equal(firstSent[0], notification);

	for (const invalid of [
		createIpcEnvelope(IpcRole.Server, request.message),
		{ ...request, version: "poe2-extensions:ipc:6", target: "server" },
		{ ...request, message: { kind: "invalid" } },
	]) {
		assert.equal(firstListener(invalid), undefined);
	}
	assert.equal(secondSent.length, 1);

	rejectSecondSend = true;
	await assert.rejects(Promise.resolve(firstListener(request)), /target failed/);
});

test("消息校验拒绝旧 JSON-RPC 和畸形内部消息", () => {
	assert.equal(isIpcMessage({ jsonrpc: "2.0", id: 1, method: "old" }), false);
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id: 0, method: "invalid" }), false);
	const validId = "123e4567-e89b-42d3-a456-426614174000";
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id: validId, method: "valid" }), true);
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id: "opaque-request-id", method: "valid" }), true);
	for (const id of ["", 0, null]) {
		assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id, method: "invalid" }), false);
	}
	assert.equal(
		isIpcMessage({
			kind: IpcMessageKind.Response,
			id: "0:1",
			result: true,
			error: { code: 1, message: "ambiguous" },
		}),
		false,
	);
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Notification, method: "valid" }), true);
});

function createHubOptionsPair(): HubOptionsPair {
	let leftListener: (value: unknown) => unknown = () => undefined;
	let rightListener: (value: unknown) => unknown = () => undefined;
	const leftSent: IpcEnvelope[] = [];
	const rightSent: IpcEnvelope[] = [];
	const leftAdapter: IpcMessageConnectionAdapter = {
		sendMessage(envelope) {
			leftSent.push(envelope);
			return Promise.resolve(rightListener(envelope));
		},
		addMessageListener(listener) {
			leftListener = listener;
		},
	};
	const rightAdapter: IpcMessageConnectionAdapter = {
		sendMessage(envelope) {
			rightSent.push(envelope);
			return Promise.resolve(leftListener(envelope));
		},
		addMessageListener(listener) {
			rightListener = listener;
		},
	};
	return {
		leftSent,
		rightSent,
		left: {
			role: IpcRole.Client,
			adapter: leftAdapter,
		},
		right: {
			role: IpcRole.Server,
			adapter: rightAdapter,
		},
	};
}

function installFakeWindow(): () => void {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const listeners = new Set<(event: MessageEvent<unknown>) => void>();
	const origin = "https://www.pathofexile.com";
	const fakeWindow = {
		location: { origin },
		postMessage(data: unknown) {
			const event = { data, origin, source: fakeWindow } as unknown as MessageEvent<unknown>;
			for (const listener of listeners) listener(event);
		},
		addEventListener(type: string, listener: (event: MessageEvent<unknown>) => void) {
			if (type === "message") listeners.add(listener);
		},
		removeEventListener(type: string, listener: (event: MessageEvent<unknown>) => void) {
			if (type === "message") listeners.delete(listener);
		},
	};
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		value: fakeWindow,
	});

	return () => {
		if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
		else Reflect.deleteProperty(globalThis, "window");
	};
}
