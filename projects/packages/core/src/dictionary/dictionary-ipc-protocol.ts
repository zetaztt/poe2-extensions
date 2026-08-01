import { defineIpcProtocol, defineRpc } from "../ipc/ipc-protocol";
import type { TranslateDictionary } from "./dictionary-types";

/**
 * 请求 background 按 fallback/cache/remote 规则选择一份有效字典。
 */
export const dictionaryIpcProtocol = defineIpcProtocol({
	name: "dictionary",
	load: defineRpc<void, TranslateDictionary>({ timeoutMs: 15_000 }),
});
