import {
	AbstractMessageReader,
	AbstractMessageWriter,
	createMessageConnection,
	type DataCallback,
	type Disposable,
	type Message,
	type MessageConnection,
} from "vscode-jsonrpc/browser";

export class JsonRpcMessageReader extends AbstractMessageReader {
	private callback: DataCallback | null = null;

	public listen(callback: DataCallback): Disposable {
		this.callback = callback;
		return {
			dispose: () => {
				if (this.callback === callback) this.callback = null;
			},
		};
	}

	public accept(message: Message): void {
		this.callback?.(message);
	}
}

export class JsonRpcMessageWriter extends AbstractMessageWriter {
	public constructor(private readonly writeMessage: (message: Message) => void | Promise<void>) {
		super();
	}

	public write(message: Message): Promise<void> {
		// 浏览器 sendMessage 的 Promise 会等待 RPC 响应，不能拿它串行阻塞后续取消消息。
		return Promise.resolve(this.writeMessage(omitUndefinedParams(message))).catch((error) => {
			this.fireError(error, message);
			throw error;
		});
	}

	public end(): void {
		this.fireClose();
	}
}

function omitUndefinedParams(message: Message): Message {
	const messageWithParams = message as Message & { params?: unknown };
	if (!("params" in messageWithParams) || messageWithParams.params !== undefined) return message;

	const { params: _params, ...messageWithoutParams } = messageWithParams;
	return messageWithoutParams;
}

export function createJsonRpcConnection(reader: JsonRpcMessageReader, writer: JsonRpcMessageWriter): MessageConnection {
	const connection = createMessageConnection(reader, writer);
	connection.listen();
	return connection;
}

export function isJsonRpcMessage(value: unknown): value is Message {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const message = value as { jsonrpc?: unknown; method?: unknown; id?: unknown; result?: unknown; error?: unknown };
	if (message.jsonrpc !== "2.0") return false;

	if (typeof message.method === "string") {
		return message.id === undefined || isJsonRpcId(message.id);
	}

	return isJsonRpcId(message.id) && ("result" in message || "error" in message);
}

function isJsonRpcId(value: unknown): value is string | number | null {
	return value === null || typeof value === "string" || typeof value === "number";
}
