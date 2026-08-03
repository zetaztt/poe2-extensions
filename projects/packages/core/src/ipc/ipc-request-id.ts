/**
 * RPC request 在 wire protocol 中使用的多 chunk ID。
 * epoch 可由多个安全整数 chunk 组成，最后一个 chunk 为 sequence。
 */
export type IpcRequestId = `${string}:${number}`;

/**
 * 为单个请求状态容器分配不回绕的多 chunk ID。
 * allocator 应由状态容器长期持有，不得在每次请求时重建。
 */
export class IpcRequestIdAllocator {
	private readonly epoch = [0];
	private prefix = "0";
	private nextId = 0;

	public allocate(): IpcRequestId {
		const id = `${this.prefix}:${this.nextId}` as const;
		if (this.nextId < Number.MAX_SAFE_INTEGER) {
			this.nextId++;
		} else {
			this.advanceEpoch();
			this.nextId = 0;
		}
		return id;
	}

	/**
	 * epoch 的最后一个 chunk 到顶后扩展数组，使 allocator 不会因安全整数上限而耗尽。
	 * 前缀只在 epoch 变化时重建，避免每次分配都重复序列化 epoch。
	 */
	private advanceEpoch(): void {
		const lastIndex = this.epoch.length - 1;
		if (this.epoch[lastIndex] < Number.MAX_SAFE_INTEGER) {
			this.epoch[lastIndex] += 1;
		} else {
			this.epoch.push(1);
		}
		this.prefix = `${this.epoch.join(":")}`;
	}
}

/**
 * 校验 wire 边界上的 ID 是否包含至少一个 epoch chunk 和一个 sequence chunk。
 */
export function isIpcRequestId(value: unknown): value is IpcRequestId {
	if (typeof value !== "string") return false;
	const chunks = value.split(":");
	if (chunks.length < 2) return false;
	return chunks.every((chunk) => /^(0|[1-9]\d*)$/.test(chunk) && Number.isSafeInteger(Number(chunk)));
}
