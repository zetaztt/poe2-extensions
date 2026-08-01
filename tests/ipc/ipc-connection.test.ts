import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	ipcMain as backgroundIpcMain,
	ipcWindow as backgroundIpcWindow,
} from "../../projects/apps/background/src/background-ipc-channels";
import type {
	ipcMain as contentIpcMain,
	ipcWindow as contentIpcWindow,
} from "../../projects/apps/content/src/content-ipc-channels";
import type {
	ipcMain as injectIpcMain,
	ipcWindow as injectIpcWindow,
} from "../../projects/apps/inject/src/inject-ipc-channels";
import type {
	ipcMain as sidePanelIpcMain,
	ipcWindow as sidePanelIpcWindow,
} from "../../projects/apps/side-panel/src/side-panel-ipc-channels";
import {
	createTabIpcChannelRouter,
	type TabIpcRouterPlatform,
} from "../../projects/packages/ipc-webextension/src/tab-ipc-channel-router";
import { createWindowIpcConnection } from "@poe2-extensions/ipc-window";
import {
	createIpcEnvelope,
	createIpcConnection,
	isIpcEnvelope,
	IpcError,
	IpcErrorCode,
	IpcMessageKind,
	IpcScope,
	IpcTarget,
	isIpcMessage,
	type IpcConnection,
	type IpcEnvelope,
	type IpcMessage,
	type IpcRequestMessage,
} from "@poe2-extensions/core/ipc/transport";
import {
	defineIpcProtocol,
	defineNotification,
	defineRpc,
	IpcChannel,
	IpcConnectionHub,
	IpcHandlerChannel,
} from "@poe2-extensions/core/ipc";

interface ConnectionPair {
	left: IpcConnection;
	right: IpcConnection;
}

const channelTestProtocol = defineIpcProtocol({
	name: "channel-test",
	echo: defineRpc<{ value: string }, string>(),
	changed: defineNotification<{ value: string }>(),
});

test("四个运行环境只向 RPC 服务端公开 handle", () => {
	type HasHandle<T> = "handle" extends keyof T ? true : false;
	const capabilities = {
		background: {
			ipcMain: true satisfies HasHandle<typeof backgroundIpcMain>,
			ipcWindow: false satisfies HasHandle<typeof backgroundIpcWindow>,
		},
		content: {
			ipcMain: false satisfies HasHandle<typeof contentIpcMain>,
			ipcWindow: false satisfies HasHandle<typeof contentIpcWindow>,
		},
		inject: {
			ipcMain: false satisfies HasHandle<typeof injectIpcMain>,
			ipcWindow: true satisfies HasHandle<typeof injectIpcWindow>,
		},
		"side-panel": {
			ipcMain: false satisfies HasHandle<typeof sidePanelIpcMain>,
			ipcWindow: false satisfies HasHandle<typeof sidePanelIpcWindow>,
		},
	};

	assert.deepEqual(capabilities, {
		background: { ipcMain: true, ipcWindow: false },
		content: { ipcMain: false, ipcWindow: false },
		inject: { ipcMain: false, ipcWindow: true },
		"side-panel": { ipcMain: false, ipcWindow: false },
	});
});

test("IpcChannel 构造时注册且相同 key 只创建一个 hub", () => {
	const pair = createConnectionPair();
	const hub = new IpcConnectionHub<void>(() => pair.left);
	const registrationKey = Symbol("constructor-registration");
	let factoryCalls = 0;
	const factory = () => {
		factoryCalls += 1;
		return hub;
	};

	const firstChannel = new IpcChannel<void>(registrationKey, false, factory);
	new IpcChannel<void>(registrationKey, false, factory);
	type HasRegister = "register" extends keyof typeof firstChannel ? true : false;
	const hasRegister: HasRegister = false;

	assert.equal(factoryCalls, 1);
	assert.equal(hasRegister, false);
	assert.equal("register" in firstChannel, false);
});

test("共享 v3 envelope 隔离 scope 和 target 并拒绝旧 transport envelope", () => {
	const envelope = createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
		kind: IpcMessageKind.Notification,
		method: "changed",
	});

	assert.equal(isIpcEnvelope(envelope, IpcScope.Window, IpcTarget.Clients), true);
	assert.equal(isIpcEnvelope(envelope, IpcScope.Main, IpcTarget.Clients), false);
	assert.equal(isIpcEnvelope(envelope, IpcScope.Window, IpcTarget.Server), false);
	assert.equal(
		isIpcEnvelope(
			{ ...envelope, version: "poe2-extensions:ipc:2", endpointId: "old-endpoint" },
			IpcScope.Window,
			IpcTarget.Clients,
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
			IpcScope.Main,
			IpcTarget.Clients,
		),
		false,
	);
});

test("Window transport 使用共享 envelope 完成双 scope 双向通信并过滤自身消息", async () => {
	const restoreWindow = installFakeWindow();
	const mainServer = createWindowIpcConnection(IpcScope.Main, IpcTarget.Clients, IpcTarget.Server);
	const mainClient = createWindowIpcConnection(IpcScope.Main, IpcTarget.Server, IpcTarget.Clients);
	const windowServer = createWindowIpcConnection(IpcScope.Window, IpcTarget.Clients, IpcTarget.Server);
	const windowClient = createWindowIpcConnection(IpcScope.Window, IpcTarget.Server, IpcTarget.Clients);

	try {
		mainServer.connection.onRequest(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
		windowServer.connection.onRequest(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
		assert.deepEqual(
			await Promise.all([
				mainClient.connection.sendRequest(channelTestProtocol.echo.method, { value: "main" }),
				windowClient.connection.sendRequest(channelTestProtocol.echo.method, { value: "window" }),
			]),
			["main", "window"],
		);

		const mainServerNotifications: string[] = [];
		const mainClientNotifications: string[] = [];
		const windowClientNotifications: string[] = [];
		mainServer.connection.onNotification(channelTestProtocol.changed.method, (data) => {
			mainServerNotifications.push((data as { value: string }).value);
		});
		mainClient.connection.onNotification(channelTestProtocol.changed.method, (data) => {
			mainClientNotifications.push((data as { value: string }).value);
		});
		windowClient.connection.onNotification(channelTestProtocol.changed.method, (data) => {
			windowClientNotifications.push((data as { value: string }).value);
		});

		await mainClient.connection.sendNotification(channelTestProtocol.changed.method, { value: "to-server" });
		await mainServer.connection.sendNotification(channelTestProtocol.changed.method, { value: "to-client" });
		assert.deepEqual(mainServerNotifications, ["to-server"]);
		assert.deepEqual(mainClientNotifications, ["to-client"]);
		assert.deepEqual(windowClientNotifications, []);
	} finally {
		mainServer.dispose();
		mainClient.dispose();
		windowServer.dispose();
		windowClient.dispose();
		restoreWindow();
	}
});

test("Tab IPC 无状态分发 notification 并拒绝反向 RPC", async () => {
	type ClientMessageListener = (value: unknown, senderTabId: number | undefined) => unknown;
	let clientMessageListener: ClientMessageListener = () => undefined;
	const sends: Array<{ tabId: number; envelope: IpcEnvelope }> = [];
	const platform: TabIpcRouterPlatform = {
		sendTabMessage(tabId, envelope) {
			sends.push({ tabId, envelope });
			return Promise.resolve(undefined);
		},
		addClientMessageListener(listener) {
			clientMessageListener = listener;
		},
	};
	const hub = createTabIpcChannelRouter(platform);
	const addresses: number[] = [];
	hub.on(channelTestProtocol.changed.method, (address) => {
		addresses.push(address);
	});

	await clientMessageListener(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Notification,
			method: channelTestProtocol.changed.method,
			data: { value: "from-tab" },
		}),
		41,
	);
	assert.equal(
		clientMessageListener(
			createIpcEnvelope(IpcScope.Window, IpcTarget.Server, {
				kind: IpcMessageKind.Notification,
				method: channelTestProtocol.changed.method,
				data: { value: "wrong-target" },
			}),
			41,
		),
		undefined,
	);
	assert.equal(
		clientMessageListener(
			createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
				kind: IpcMessageKind.Notification,
				method: channelTestProtocol.changed.method,
			}),
			undefined,
		),
		undefined,
	);

	const reverseResponse = (await clientMessageListener(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Server, {
			kind: IpcMessageKind.Request,
			id: 7,
			method: channelTestProtocol.echo.method,
		}),
		41,
	)) as IpcEnvelope | undefined;
	assert.equal(reverseResponse, undefined);
	const acceptedReverseResponse = (await clientMessageListener(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Request,
			id: 8,
			method: channelTestProtocol.echo.method,
		}),
		41,
	)) as IpcEnvelope;
	assert.equal(acceptedReverseResponse.target, IpcTarget.Server);
	assert.equal(acceptedReverseResponse.message.kind, IpcMessageKind.Response);
	assert.equal(
		acceptedReverseResponse.message.kind === IpcMessageKind.Response
			? acceptedReverseResponse.message.error?.code
			: undefined,
		IpcErrorCode.MethodNotFound,
	);

	await hub.send(42, channelTestProtocol.changed.method, { value: "to-tab" });
	assert.deepEqual(addresses, [41]);
	assert.equal(sends.at(-1)?.tabId, 42);
	assert.equal(sends.at(-1)?.envelope.target, IpcTarget.Server);
});

test("Tab IPC 并发 RPC 使用独立临时 connection 且失败后不保留状态", async () => {
	interface PendingSend {
		tabId: number;
		envelope: IpcEnvelope;
		resolve: (value: unknown) => void;
	}
	let timeoutAttempts = 0;
	const pendingSends: PendingSend[] = [];
	const platform: TabIpcRouterPlatform = {
		sendTabMessage(tabId, envelope) {
			if (tabId === 99) return Promise.reject(new Error("tab 不存在"));
			if (tabId === 44) {
				timeoutAttempts += 1;
				if (timeoutAttempts === 1) return new Promise(() => undefined);
			}
			return new Promise((resolve) => pendingSends.push({ tabId, envelope, resolve }));
		},
		addClientMessageListener() {},
	};
	const hub = createTabIpcChannelRouter(platform);
	const first = hub.invoke(42, channelTestProtocol.echo.method, { value: "first" }, 10_000);
	const second = hub.invoke(42, channelTestProtocol.echo.method, { value: "second" }, 10_000);
	const third = hub.invoke(43, channelTestProtocol.echo.method, { value: "third" }, 10_000);

	assert.deepEqual(
		pendingSends.map(({ tabId, envelope }) => ({
			tabId,
			id: envelope.message.kind === IpcMessageKind.Request ? envelope.message.id : undefined,
		})),
		[
			{ tabId: 42, id: 1 },
			{ tabId: 42, id: 1 },
			{ tabId: 43, id: 1 },
		],
	);
	for (const index of [2, 0, 1]) {
		const pending = pendingSends[index];
		if (!pending || pending.envelope.message.kind !== IpcMessageKind.Request) continue;
		pending.resolve(
			createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
				kind: IpcMessageKind.Response,
				id: pending.envelope.message.id,
				result: (pending.envelope.message.data as { value: string }).value,
			}),
		);
	}
	assert.deepEqual(await Promise.all([first, second, third]), ["first", "second", "third"]);

	await assert.rejects(hub.send(99, channelTestProtocol.changed.method, undefined), /tab 不存在/);
	await assert.rejects(
		hub.invoke(44, channelTestProtocol.echo.method, { value: "timeout" }, 10),
		(error) => error instanceof IpcError && error.code === IpcErrorCode.Timeout,
	);
	const retry = hub.invoke(44, channelTestProtocol.echo.method, { value: "retry" }, 10_000);
	const retrySend = pendingSends.at(-1);
	assert.equal(retrySend?.tabId, 44);
	if (retrySend?.envelope.message.kind === IpcMessageKind.Request) {
		retrySend.resolve(
			createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
				kind: IpcMessageKind.Response,
				id: retrySend.envelope.message.id,
				result: "retry",
			}),
		);
	}
	assert.equal(await retry, "retry");
});

test("无地址 IpcChannel 支持 invoke 和 publish", async () => {
	const pair = createConnectionPair();
	const hub = new IpcConnectionHub<void>(() => pair.left);
	hub.addConnection(pair.left);
	const channel = new IpcHandlerChannel<void>(Symbol("unaddressed-ipc-channel"), false, () => hub);

	pair.right.onRequest(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
	channel.handle(channelTestProtocol.echo, ({ value }) => value);
	const notifications: string[] = [];
	channel.on(channelTestProtocol.changed, ({ value }) => {
		notifications.push(value);
	});

	assert.equal(await channel.invoke(channelTestProtocol.echo, { value: "invoke" }), "invoke");
	assert.equal(await pair.right.sendRequest(channelTestProtocol.echo.method, { value: "handle" }), "handle");
	await channel.send(channelTestProtocol.changed, { value: "publish" });
	assert.deepEqual(notifications, ["publish"]);
});

test("有地址 IpcChannel 使用 address-first 的 invoke 和 send", async () => {
	const pair = createConnectionPair();
	const resolvedAddresses: number[] = [];
	const hub = new IpcConnectionHub<number>((address) => {
		resolvedAddresses.push(address);
		return pair.left;
	});
	const channel = new IpcChannel<number>(Symbol("addressed-ipc-channel"), true, () => hub);

	pair.right.onRequest(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
	const notifications: string[] = [];
	pair.right.onNotification(channelTestProtocol.changed.method, (data) => {
		notifications.push((data as { value: string }).value);
	});

	assert.equal(await channel.invoke(42, channelTestProtocol.echo, { value: "invoke" }), "invoke");
	await channel.send(42, channelTestProtocol.changed, { value: "send" });
	assert.deepEqual(resolvedAddresses, [42, 42]);
	assert.deepEqual(notifications, ["send"]);
});

test("有地址 IpcChannel 的 on 在回调中提供来源 address", async () => {
	const existingPair = createConnectionPair();
	const futurePair = createConnectionPair();
	const hub = new IpcConnectionHub<number>(() => {
		throw new Error("测试连接应通过 addConnection 注册");
	});
	hub.addConnection(existingPair.left, 41);
	const channel = new IpcChannel<number>(Symbol("addressed-ipc-listeners"), true, () => hub);

	const notifications: string[] = [];
	const listenerAddresses: number[] = [];
	channel.on(channelTestProtocol.changed, (address, { value }) => {
		listenerAddresses.push(address);
		notifications.push(value);
	});
	hub.addConnection(futurePair.left, 42);

	await existingPair.right.sendNotification(channelTestProtocol.changed.method, { value: "existing" });
	await futurePair.right.sendNotification(channelTestProtocol.changed.method, { value: "future" });
	assert.deepEqual(listenerAddresses, [41, 42]);
	assert.deepEqual(notifications, ["existing", "future"]);
});

test("request 支持无参数、undefined result 和并发乱序响应", async () => {
	const sentMessages: IpcMessage[] = [];
	const connection = createIpcConnection((message) => {
		sentMessages.push(message);
		return undefined;
	});

	const first = connection.sendRequest("first");
	const second = connection.sendRequest("second", { value: 2 });
	const [firstRequest, secondRequest] = sentMessages as IpcRequestMessage[];

	await connection.receive({
		kind: IpcMessageKind.Response,
		id: secondRequest.id,
		result: "second-result",
	});
	await connection.receive({
		kind: IpcMessageKind.Response,
		id: firstRequest.id,
	});

	assert.equal(await first, undefined);
	assert.equal(await second, "second-result");
	assert.equal("data" in firstRequest, false);
});

test("具名 request、notification、fallback 和 handler 注销按预期工作", async () => {
	const pair = createConnectionPair();
	const notifications: unknown[] = [];
	const namedRequest = pair.right.onRequest("named", (data) => ({ data }));
	const namedNotification = pair.right.onNotification("changed", (data) => {
		notifications.push(data);
	});
	const fallbackRequest = pair.right.onRequest((method, data) => ({ method, data }));
	const fallbackNotification = pair.right.onNotification((method, data) => {
		notifications.push({ method, data });
	});

	assert.deepEqual(await pair.left.sendRequest("named", 1), { data: 1 });
	assert.deepEqual(await pair.left.sendRequest("fallback", 2), { method: "fallback", data: 2 });
	await pair.left.sendNotification("changed", 3);
	await pair.left.sendNotification("fallback-notification", 4);
	await Promise.resolve();
	assert.deepEqual(notifications, [3, { method: "fallback-notification", data: 4 }]);

	namedRequest.dispose();
	namedNotification.dispose();
	fallbackRequest.dispose();
	fallbackNotification.dispose();
	await assert.rejects(
		pair.left.sendRequest("named"),
		(error) => error instanceof IpcError && error.code === IpcErrorCode.MethodNotFound,
	);
});

test("远端 IpcError 保留 code/message/data，普通异常转换为 InternalError", async () => {
	const pair = createConnectionPair();
	pair.right.onRequest("structured", () => {
		throw new IpcError(42, "结构化错误", { reason: "test" });
	});
	pair.right.onRequest("plain", () => {
		throw new Error("普通错误");
	});

	await assert.rejects(
		pair.left.sendRequest("structured"),
		(error) =>
			error instanceof IpcError
			&& error.code === 42
			&& error.message === "结构化错误"
			&& assert.deepEqual(error.data, { reason: "test" }) === undefined,
	);
	await assert.rejects(
		pair.left.sendRequest("plain"),
		(error) =>
			error instanceof IpcError && error.code === IpcErrorCode.InternalError && error.message === "普通错误",
	);
});

test("本地超时清理 pending，迟到响应被忽略且不会发送 cancel", async () => {
	const sentMessages: IpcMessage[] = [];
	const connection = createIpcConnection((message) => {
		sentMessages.push(message);
		return undefined;
	});
	const request = connection.sendRequest("slow", undefined, Date.now() + 20);
	const requestMessage = sentMessages[0] as IpcRequestMessage;

	await assert.rejects(request, (error) => error instanceof IpcError && error.code === IpcErrorCode.Timeout);
	assert.deepEqual(
		sentMessages.map((message) => message.kind),
		[IpcMessageKind.Request],
	);

	await connection.receive({
		kind: IpcMessageKind.Response,
		id: requestMessage.id,
		result: "late",
	});
	const next = connection.sendRequest("next");
	const nextMessage = sentMessages[1] as IpcRequestMessage;
	await connection.receive({
		kind: IpcMessageKind.Response,
		id: nextMessage.id,
		result: "ok",
	});
	assert.equal(await next, "ok");
});

test("relay 传播原始 deadline 并返回目标结果", async () => {
	const sourcePair = createConnectionPair();
	const targetPair = createConnectionPair();
	const hub = new IpcConnectionHub<string>((address) => {
		assert.equal(address, "target");
		return targetPair.left;
	});
	hub.addRelay(sourcePair.right, "target");

	let receivedDeadline: number | undefined;
	targetPair.right.onRequest("relayed", (data, context) => {
		receivedDeadline = context.deadline;
		return data;
	});
	const deadline = Date.now() + 1_000;

	assert.equal(await sourcePair.left.sendRequest("relayed", "value", deadline), "value");
	assert.equal(receivedDeadline, deadline);
});

test("dispose 拒绝 pending、仅执行一次回调并阻止后续发送", async () => {
	const connection = createIpcConnection(() => undefined);
	let disposeCount = 0;
	connection.onDispose(() => {
		disposeCount += 1;
	});
	const pending = connection.sendRequest("pending");

	connection.dispose();
	connection.dispose();

	await assert.rejects(
		pending,
		(error) => error instanceof IpcError && error.code === IpcErrorCode.ConnectionDisposed,
	);
	await assert.rejects(
		connection.sendNotification("after-dispose"),
		(error) => error instanceof IpcError && error.code === IpcErrorCode.ConnectionDisposed,
	);
	assert.equal(disposeCount, 1);
});

test("消息校验拒绝旧 JSON-RPC 和畸形内部消息", () => {
	assert.equal(isIpcMessage({ jsonrpc: "2.0", id: 1, method: "old" }), false);
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id: 0, method: "invalid" }), false);
	assert.equal(
		isIpcMessage({
			kind: IpcMessageKind.Response,
			id: 1,
			result: true,
			error: { code: 1, message: "ambiguous" },
		}),
		false,
	);
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Notification, method: "valid" }), true);
});

function createConnectionPair(): ConnectionPair {
	let left: IpcConnection;
	let right: IpcConnection;
	left = createIpcConnection((message) => right.receive(message));
	right = createIpcConnection((message) => left.receive(message));
	return { left, right };
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
