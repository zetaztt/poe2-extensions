import { defineIpcProtocol, defineRpc } from "../ipc/ipc-protocol";
import type { TranslateDictionary } from "./dictionary-types";

export const dictionaryIpcProtocol = defineIpcProtocol({
	name: "dictionary",
	load: defineRpc<void, TranslateDictionary>({ timeoutMs: 15_000 }),
});
