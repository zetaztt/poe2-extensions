import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	ipcMain as backgroundIpcMain,
	ipcWindow as backgroundIpcWindow,
} from "../../projects/apps/background/src/background-ipc-channels";
import type {
	ipcMain as injectIpcMain,
	ipcWindow as injectIpcWindow,
} from "../../projects/apps/inject/src/inject-ipc-channels";
import type {
	ipcMain as sidePanelIpcMain,
	ipcWindow as sidePanelIpcWindow,
} from "../../projects/apps/side-panel/src/side-panel-ipc-channels";
import { createWindowIpcTransport } from "@poe2-extensions/ipc-window";
import { Result } from "@poe2-extensions/core/result";
import {
	createIpcEnvelope,
	isIpcEnvelope,
	IpcError,
	IpcErrorCode,
	IpcMessageKind,
	IpcScope,
	IpcTarget,
	isIpcMessage,
	type IpcEnvelope,
	type IpcMessage,
	type IpcRequestMessage,
} from "@poe2-extensions/core/ipc/transport";
import {
	defineIpcProtocol,
	defineNotification,
	defineRpc,
	IpcAddressedChannel,
	IpcAddressedConnectionHub,
	IpcChannel,
	IpcConnectionHub,
	IpcEnvelopeRelay,
	IpcHandlerChannel,
	IpcHandlerConnectionHub,
	type IpcAddressedConnectionHubTransport,
	type IpcConnectionHubOptions,
	type IpcConnectionHubTransport,
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
		background: {
			ipcMain: true satisfies HasHandle<typeof backgroundIpcMain>,
			ipcWindow: false satisfies HasHandle<typeof backgroundIpcWindow>,
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

	assert.deepEqual(hubCapabilities, {
		connection: false,
		handlerConnection: true,
	});
	assert.deepEqual(capabilities, {
		background: { ipcMain: true, ipcWindow: false },
		inject: { ipcMain: false, ipcWindow: true },
		"side-panel": { ipcMain: false, ipcWindow: false },
	});
});

test("IpcChannel 构造时注册且相同 key 只创建一个 hub", () => {
	const pair = createHubOptionsPair(IpcScope.Main);
	const hub = new IpcConnectionHub(pair.left);
	const registrationKey = Symbol("constructor-registration");
	let factoryCalls = 0;
	const factory = () => {
		factoryCalls += 1;
		return hub;
	};

	const firstChannel = new IpcChannel(registrationKey, factory);
	new IpcChannel(registrationKey, factory);
	type HasRegister = "register" extends keyof typeof firstChannel ? true : false;
	const hasRegister: HasRegister = false;

	assert.equal(factoryCalls, 1);
	assert.equal(hasRegister, false);
	assert.equal("register" in firstChannel, false);
});

test("共享 v4 envelope 隔离 scope 和 target 并拒绝旧 transport envelope", () => {
	const envelope = createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
		kind: IpcMessageKind.Notification,
		method: "changed",
	});

	assert.equal(isIpcEnvelope(envelope, IpcScope.Window, IpcTarget.Clients), true);
	assert.equal(isIpcEnvelope(envelope, IpcScope.Main, IpcTarget.Clients), false);
	assert.equal(isIpcEnvelope(envelope, IpcScope.Window, IpcTarget.Server), false);
	assert.equal(
		isIpcEnvelope(
			{ ...envelope, version: "poe2-extensions:ipc:3", endpointId: "old-endpoint" },
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
	const mainServer = new IpcHandlerConnectionHub({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Clients,
		incomingTarget: IpcTarget.Server,
		transport: createWindowIpcTransport(),
	});
	const mainClient = new IpcConnectionHub({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: createWindowIpcTransport(),
	});
	const windowServer = new IpcHandlerConnectionHub({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Clients,
		incomingTarget: IpcTarget.Server,
		transport: createWindowIpcTransport(),
	});
	const windowClient = new IpcConnectionHub({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: createWindowIpcTransport(),
	});

	try {
		mainServer.handle(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
		windowServer.handle(channelTestProtocol.echo.method, (data) => (data as { value: string }).value);
		assert.deepEqual(
			await Promise.all([
				mainClient.invoke(channelTestProtocol.echo.method, { value: "main" }, 1_000),
				windowClient.invoke(channelTestProtocol.echo.method, { value: "window" }, 1_000),
			]),
			["main", "window"],
		);

		const mainClientNotifications: string[] = [];
		const windowClientNotifications: string[] = [];
		mainClient.on(channelTestProtocol.changed.method, (data) => {
			mainClientNotifications.push((data as { value: string }).value);
		});
		windowClient.on(channelTestProtocol.changed.method, (data) => {
			windowClientNotifications.push((data as { value: string }).value);
		});

		await mainServer.send(channelTestProtocol.changed.method, { value: "to-client" });
		assert.deepEqual(mainClientNotifications, ["to-client"]);
		assert.deepEqual(windowClientNotifications, []);
	} finally {
		restoreWindow();
	}
});

test("Tab IPC 无状态分发 notification 并拒绝反向 RPC", async () => {
	type ClientMessageListener = (value: unknown, senderTabId: number | undefined) => unknown;
	let clientMessageListener: ClientMessageListener = () => undefined;
	const sends: Array<{ tabId: number; envelope: IpcEnvelope }> = [];
	const transport: IpcAddressedConnectionHubTransport<number> = {
		sendMessage(tabId, envelope) {
			sends.push({ tabId, envelope });
			return Promise.resolve(undefined);
		},
		addMessageListener(listener) {
			clientMessageListener = listener;
		},
	};
	const hub = new IpcAddressedConnectionHub({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport,
	});
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
			id: "0:7",
			method: channelTestProtocol.echo.method,
		}),
		41,
	)) as IpcEnvelope | undefined;
	assert.equal(reverseResponse, undefined);
	const acceptedReverseResponse = (await clientMessageListener(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Request,
			id: "0:8",
			method: channelTestProtocol.echo.method,
		}),
		41,
	)) as IpcEnvelope;
	assert.equal(acceptedReverseResponse.target, IpcTarget.Server);
	assert.equal(acceptedReverseResponse.message.kind, IpcMessageKind.Response);
	assert.deepEqual(
		acceptedReverseResponse.message.kind === IpcMessageKind.Response
			? acceptedReverseResponse.message.error
			: undefined,
		{
			code: IpcErrorCode.InternalError,
			message: `IPC 消息处理未定义: ${IpcMessageKind.Request}`,
		},
	);

	await hub.send(42, channelTestProtocol.changed.method, { value: "to-tab" });
	assert.deepEqual(addresses, [41]);
	assert.equal(sends.at(-1)?.tabId, 42);
	assert.equal(sends.at(-1)?.envelope.target, IpcTarget.Server);
});

test("Tab IPC 并发 RPC 共享请求管理器并按 address 隔离 response", async () => {
	interface PendingSend {
		tabId: number;
		envelope: IpcEnvelope;
		resolve: (value: unknown) => void;
	}
	let timeoutAttempts = 0;
	let clientMessageListener: (value: unknown, address: number | undefined) => unknown = () => undefined;
	let asyncRequestEnvelope: IpcEnvelope | undefined;
	let timeoutRequestEnvelope: IpcEnvelope | undefined;
	const pendingSends: PendingSend[] = [];
	const transport: IpcAddressedConnectionHubTransport<number> = {
		sendMessage(tabId, envelope) {
			if (tabId === 99) return Promise.reject(new Error("tab 不存在"));
			if (tabId === 45) {
				asyncRequestEnvelope = envelope;
				return Promise.resolve(undefined);
			}
			if (tabId === 46 && envelope.message.kind === IpcMessageKind.Request) {
				return Promise.resolve(
					createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
						kind: IpcMessageKind.Response,
						id: envelope.message.id,
						error: { code: 1234, message: "remote error", data: { source: "remote" } },
					}),
				);
			}
			if (tabId === 44) {
				timeoutAttempts += 1;
				if (timeoutAttempts === 1) {
					timeoutRequestEnvelope = envelope;
					return new Promise(() => undefined);
				}
			}
			return new Promise((resolve) => pendingSends.push({ tabId, envelope, resolve }));
		},
		addMessageListener(listener) {
			clientMessageListener = listener;
		},
	};
	const hub = new IpcAddressedConnectionHub({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport,
	});
	const first = hub.invoke(42, channelTestProtocol.echo.method, { value: "first" }, 10_000);
	const second = hub.invoke(42, channelTestProtocol.echo.method, { value: "second" }, 10_000);
	const third = hub.invoke(43, channelTestProtocol.echo.method, { value: "third" }, 10_000);

	assert.deepEqual(
		pendingSends.map(({ tabId, envelope }) => ({
			tabId,
			id: envelope.message.kind === IpcMessageKind.Request ? envelope.message.id : undefined,
		})),
		[
			{ tabId: 42, id: "0:0" },
			{ tabId: 42, id: "0:1" },
			{ tabId: 43, id: "0:2" },
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

	let asyncSettled = false;
	const asyncRequest = hub.invoke(45, channelTestProtocol.echo.method, { value: "async" }, 10_000).finally(() => {
		asyncSettled = true;
	});
	assert.equal(asyncRequestEnvelope?.message.kind, IpcMessageKind.Request);
	if (asyncRequestEnvelope?.message.kind === IpcMessageKind.Request) {
		const response = createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Response,
			id: asyncRequestEnvelope.message.id,
			result: "async",
		});
		clientMessageListener(response, 46);
		await Promise.resolve();
		assert.equal(asyncSettled, false);
		clientMessageListener(response, 45);
	}
	assert.equal(await asyncRequest, "async");

	await assert.rejects(
		hub.invoke(46, channelTestProtocol.echo.method, undefined, 10_000),
		(error) =>
			error instanceof IpcError
			&& error.code === 1234
			&& error.message === "remote error"
			&& (error.data as { source?: unknown }).source === "remote",
	);
	await assert.rejects(hub.invoke(99, channelTestProtocol.echo.method, undefined, 10_000), /tab 不存在/);
	await assert.rejects(
		hub.invoke(44, channelTestProtocol.echo.method, { value: "timeout" }, 10),
		(error) => error instanceof IpcError && error.code === IpcErrorCode.Timeout,
	);
	if (timeoutRequestEnvelope?.message.kind === IpcMessageKind.Request) {
		clientMessageListener(
			createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
				kind: IpcMessageKind.Response,
				id: timeoutRequestEnvelope.message.id,
				result: "late",
			}),
			44,
		);
	}
	const retry = hub.invoke(44, channelTestProtocol.echo.method, { value: "retry" }, 10_000);
	const retrySend = pendingSends.at(-1);
	assert.equal(retrySend?.tabId, 44);
	assert.equal(
		retrySend?.envelope.message.kind === IpcMessageKind.Request ? retrySend.envelope.message.id : undefined,
		"0:7",
	);
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

test("IpcHandlerChannel 使用不含 address 的 invoke、send、on 和 handle", async () => {
	const pair = createHubOptionsPair(IpcScope.Main);
	const hub = new IpcHandlerConnectionHub(pair.left);
	const remoteHub = new IpcHandlerConnectionHub(pair.right);
	const channel = new IpcHandlerChannel(Symbol("unaddressed-ipc-channel"), () => hub);

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
	const pair = createHubOptionsPair(IpcScope.Main);
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

test("IpcAddressedChannel 使用 address-first 的 invoke 和 send", async () => {
	let messageListener: ((value: unknown, address: number | undefined) => unknown) | undefined;
	const sentAddresses: number[] = [];
	const sentEnvelopes: IpcEnvelope[] = [];
	const transport: IpcAddressedConnectionHubTransport<number> = {
		sendMessage(address, envelope) {
			sentAddresses.push(address);
			sentEnvelopes.push(envelope);
			if (envelope.message.kind !== IpcMessageKind.Request) return Promise.resolve(undefined);
			return Promise.resolve(
				createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
					kind: IpcMessageKind.Response,
					id: envelope.message.id,
					result: (envelope.message.data as { value: string }).value,
				}),
			);
		},
		addMessageListener(listener) {
			messageListener = listener;
		},
	};
	const hub = new IpcAddressedConnectionHub<number>({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport,
	});
	const channel = new IpcAddressedChannel<number>(Symbol("addressed-ipc-channel"), () => hub);
	const listenerAddresses: number[] = [];
	channel.on(channelTestProtocol.changed, (address) => {
		listenerAddresses.push(address);
	});

	assert.equal(await channel.invoke(42, channelTestProtocol.echo, { value: "invoke" }), "invoke");
	await channel.send(42, channelTestProtocol.changed, { value: "send" });
	await messageListener?.(
		createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
			kind: IpcMessageKind.Notification,
			method: channelTestProtocol.changed.method,
			data: { value: "source" },
		}),
		41,
	);

	assert.deepEqual(sentAddresses, [42, 42]);
	assert.equal(sentEnvelopes[0]?.scope, IpcScope.Main);
	assert.equal(sentEnvelopes[0]?.target, IpcTarget.Server);
	assert.equal(sentEnvelopes[0]?.message.kind, IpcMessageKind.Request);
	assert.equal(sentEnvelopes[1]?.message.kind, IpcMessageKind.Notification);
	assert.deepEqual(listenerAddresses, [41]);
});

test("IpcAddressedConnectionHub 独立替换并注销 notification handler", async () => {
	let messageListener: ((value: unknown, address: number | undefined) => unknown) | undefined;
	const transport: IpcAddressedConnectionHubTransport<number> = {
		sendMessage() {
			return Promise.resolve(undefined);
		},
		addMessageListener(listener) {
			messageListener = listener;
		},
	};
	const hub = new IpcAddressedConnectionHub<number>({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport,
	});
	const received: string[] = [];
	const disposeFirst = hub.on("changed", () => {
		received.push("first");
	});
	const disposeSecond = hub.on("changed", () => {
		received.push("second");
	});
	disposeFirst();

	await messageListener?.(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Notification,
			method: "changed",
		}),
		41,
	);
	assert.deepEqual(received, ["second"]);
	disposeSecond();
	await messageListener?.(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Notification,
			method: "changed",
		}),
		42,
	);
	assert.deepEqual(received, ["second"]);
});

test("IpcAddressedConnectionHub 子类通过 Result 实现入站 request", async () => {
	class TestAddressedConnectionHub extends IpcAddressedConnectionHub<number> {
		protected override async receiveMessage(
			address: number,
			message: IpcMessage,
		): Promise<Result<unknown, IpcError>> {
			if (message.kind === IpcMessageKind.Request && message.method === "implemented") {
				return Result.ok({ address, data: message.data });
			}
			return super.receiveMessage(address, message);
		}
	}

	let messageListener: ((value: unknown, address: number | undefined) => unknown) | undefined;
	const hub = new TestAddressedConnectionHub({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: {
			sendMessage: () => Promise.resolve(undefined),
			addMessageListener(listener) {
				messageListener = listener;
			},
		},
	});
	assert.ok(hub);

	const success = (await messageListener?.(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Request,
			id: "0:11",
			method: "implemented",
			data: "value",
		}),
		41,
	)) as IpcEnvelope;
	assert.deepEqual(success.message, {
		kind: IpcMessageKind.Response,
		id: "0:11",
		result: { address: 41, data: "value" },
	});

	const missing = (await messageListener?.(
		createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
			kind: IpcMessageKind.Request,
			id: "0:12",
			method: "missing",
		}),
		41,
	)) as IpcEnvelope;
	assert.equal(missing.message.kind, IpcMessageKind.Response);
	assert.deepEqual(missing.message.kind === IpcMessageKind.Response ? missing.message.error : undefined, {
		code: IpcErrorCode.InternalError,
		message: `IPC 消息处理未定义: ${IpcMessageKind.Request}`,
	});
});

test("request 支持无参数、undefined result 和并发乱序响应", async () => {
	const sentMessages: IpcMessage[] = [];
	let listener: (value: unknown) => unknown = () => undefined;
	const hub = new IpcConnectionHub({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: {
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
		createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
			kind: IpcMessageKind.Response,
			id: secondRequest.id,
			result: "second-result",
		}),
	);
	await listener(
		createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
			kind: IpcMessageKind.Response,
			id: firstRequest.id,
		}),
	);

	assert.equal(await first, undefined);
	assert.equal(await second, "second-result");
	assert.equal("data" in firstRequest, false);
});

test("request ID 使用可扩展 epoch chunk 进位并复用缓存前缀", async () => {
	const connectionMessages: IpcRequestMessage[] = [];
	const hub = new IpcConnectionHub({
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: {
			async sendMessage(envelope) {
				if (envelope.message.kind !== IpcMessageKind.Request) return undefined;
				connectionMessages.push(envelope.message);
				return createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
					kind: IpcMessageKind.Response,
					id: envelope.message.id,
					result: envelope.message.id,
				});
			},
			addMessageListener() {},
		},
	});
	Reflect.set(Reflect.get(hub, "requestIdAllocator"), "nextId", Number.MAX_SAFE_INTEGER);

	assert.equal(await hub.invoke("last-sequence", undefined, 1_000), `0:${Number.MAX_SAFE_INTEGER}`);
	assert.equal(await hub.invoke("next-epoch", undefined, 1_000), "1:0");
	assert.deepEqual(
		connectionMessages.map(({ id }) => id),
		[`0:${Number.MAX_SAFE_INTEGER}`, "1:0"],
	);

	const allocator = Reflect.get(hub, "requestIdAllocator");
	Reflect.set(allocator, "epoch", [Number.MAX_SAFE_INTEGER]);
	Reflect.set(allocator, "prefix", `${Number.MAX_SAFE_INTEGER}`);
	Reflect.set(allocator, "nextId", Number.MAX_SAFE_INTEGER);
	assert.equal(
		await hub.invoke("last-single-epoch", undefined, 1_000),
		`${Number.MAX_SAFE_INTEGER}:${Number.MAX_SAFE_INTEGER}`,
	);
	assert.equal(await hub.invoke("extended-epoch", undefined, 1_000), `${Number.MAX_SAFE_INTEGER}:1:0`);

	const addressedMessages: IpcRequestMessage[] = [];
	const addressedHub = new IpcAddressedConnectionHub<number>({
		scope: IpcScope.Window,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: {
			sendMessage(_address, envelope) {
				if (envelope.message.kind !== IpcMessageKind.Request) return Promise.resolve(undefined);
				addressedMessages.push(envelope.message);
				return Promise.resolve(
					createIpcEnvelope(IpcScope.Window, IpcTarget.Clients, {
						kind: IpcMessageKind.Response,
						id: envelope.message.id,
						result: envelope.message.id,
					}),
				);
			},
			addMessageListener() {},
		},
	});
	Reflect.set(Reflect.get(addressedHub, "requestIdAllocator"), "nextId", Number.MAX_SAFE_INTEGER);

	assert.equal(await addressedHub.invoke(42, "last-sequence", undefined, 1_000), `0:${Number.MAX_SAFE_INTEGER}`);
	assert.equal(await addressedHub.invoke(42, "next-epoch", undefined, 1_000), "1:0");
	assert.deepEqual(
		addressedMessages.map(({ id }) => id),
		[`0:${Number.MAX_SAFE_INTEGER}`, "1:0"],
	);
});

test("具名 request、notification 和 handler 注销按预期工作", async () => {
	const pair = createHubOptionsPair(IpcScope.Main);
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
	const pair = createHubOptionsPair(IpcScope.Main);
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
		scope: IpcScope.Main,
		outgoingTarget: IpcTarget.Server,
		incomingTarget: IpcTarget.Clients,
		transport: {
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
		createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
			kind: IpcMessageKind.Response,
			id: requestMessage.id,
			result: "late",
		}),
	);
	const next = hub.invoke("next", undefined, 1_000);
	const nextMessage = sentMessages[1] as IpcRequestMessage;
	await listener(
		createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
			kind: IpcMessageKind.Response,
			id: nextMessage.id,
			result: "ok",
		}),
	);
	assert.equal(await next, "ok");
});

test("IpcEnvelopeRelay 双向原样转发 envelope 和 transport response", async () => {
	let firstListener: (value: unknown) => unknown = () => undefined;
	let secondListener: (value: unknown) => unknown = () => undefined;
	const firstSent: unknown[] = [];
	const secondSent: unknown[] = [];
	const response = createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
		kind: IpcMessageKind.Response,
		id: "0:7",
		result: "relayed",
	});
	let rejectSecondSend = false;
	const firstTransport: IpcConnectionHubTransport = {
		sendMessage(envelope) {
			firstSent.push(envelope);
			return Promise.resolve(undefined);
		},
		addMessageListener(listener) {
			firstListener = listener;
		},
	};
	const secondTransport: IpcConnectionHubTransport = {
		sendMessage(envelope) {
			secondSent.push(envelope);
			return rejectSecondSend ? Promise.reject(new Error("target failed")) : Promise.resolve(response);
		},
		addMessageListener(listener) {
			secondListener = listener;
		},
	};
	new IpcEnvelopeRelay({
		first: {
			scope: IpcScope.Main,
			incomingTarget: IpcTarget.Server,
			transport: firstTransport,
		},
		second: {
			scope: IpcScope.Main,
			incomingTarget: IpcTarget.Clients,
			transport: secondTransport,
		},
	});
	const request = createIpcEnvelope(IpcScope.Main, IpcTarget.Server, {
		kind: IpcMessageKind.Request,
		id: "0:7",
		method: "relayed",
	});

	assert.equal(await firstListener(request), response);
	assert.equal(secondSent[0], request);

	const notification = createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, {
		kind: IpcMessageKind.Notification,
		method: "changed",
		data: { value: "from-second" },
	});
	await secondListener(notification);
	assert.equal(firstSent[0], notification);

	for (const invalid of [
		createIpcEnvelope(IpcScope.Window, IpcTarget.Server, request.message),
		createIpcEnvelope(IpcScope.Main, IpcTarget.Clients, request.message),
		{ ...request, version: "poe2-extensions:ipc:3" },
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
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id: "0:1", method: "valid" }), true);
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id: "1:0", method: "valid" }), true);
	assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id: "0:1:0", method: "valid" }), true);
	assert.equal(
		isIpcMessage({
			kind: IpcMessageKind.Request,
			id: `${Number.MAX_SAFE_INTEGER}:${Number.MAX_SAFE_INTEGER}`,
			method: "valid",
		}),
		true,
	);
	for (const id of ["", "0", "00:1", "0:01", "-1:1", "0:-1", "0::1", "invalid:1"]) {
		assert.equal(isIpcMessage({ kind: IpcMessageKind.Request, id, method: "invalid" }), false);
	}
	assert.equal(
		isIpcMessage({
			kind: IpcMessageKind.Request,
			id: `${Number.MAX_SAFE_INTEGER + 1}:1`,
			method: "invalid",
		}),
		false,
	);
	assert.equal(
		isIpcMessage({
			kind: IpcMessageKind.Request,
			id: `0:${Number.MAX_SAFE_INTEGER + 1}`,
			method: "invalid",
		}),
		false,
	);
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

function createHubOptionsPair(scope: IpcScope): HubOptionsPair {
	let leftListener: (value: unknown) => unknown = () => undefined;
	let rightListener: (value: unknown) => unknown = () => undefined;
	const leftSent: IpcEnvelope[] = [];
	const rightSent: IpcEnvelope[] = [];
	const leftTransport: IpcConnectionHubTransport = {
		sendMessage(envelope) {
			leftSent.push(envelope);
			return Promise.resolve(rightListener(envelope));
		},
		addMessageListener(listener) {
			leftListener = listener;
		},
	};
	const rightTransport: IpcConnectionHubTransport = {
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
			scope,
			outgoingTarget: IpcTarget.Server,
			incomingTarget: IpcTarget.Clients,
			transport: leftTransport,
		},
		right: {
			scope,
			outgoingTarget: IpcTarget.Clients,
			incomingTarget: IpcTarget.Server,
			transport: rightTransport,
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
