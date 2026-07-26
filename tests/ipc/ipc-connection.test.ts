import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createIpcConnection,
	IpcError,
	IpcErrorCode,
	IpcMessageKind,
	isIpcMessage,
	type IpcConnection,
	type IpcMessage,
	type IpcRequestMessage,
} from "@poe2-extensions/core/ipc/transport";
import { IpcConnectionHub } from "@poe2-extensions/core/ipc";

interface ConnectionPair {
	left: IpcConnection;
	right: IpcConnection;
}

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
