import crypto from "node:crypto";
import fs from "fs";
import { getTextOriginal, getTextTranslate, readTexts } from "./utils";

const translateMetaPath = "./assets/translate-meta.json";
const translateJsonPath = "./assets/translate.json";

interface TranslateMeta {
	md5: string;
	version: number;
}

function readTranslateMeta(): TranslateMeta | undefined {
	if (!fs.existsSync(translateMetaPath)) {
		return undefined;
	}

	try {
		const translateMetaJson = fs.readFileSync(translateMetaPath, { encoding: "utf8" });
		const translateMeta = JSON.parse(translateMetaJson) as Partial<TranslateMeta>;
		if (typeof translateMeta.md5 !== "string" || typeof translateMeta.version !== "number") {
			return undefined;
		}
		return {
			md5: translateMeta.md5,
			version: translateMeta.version,
		};
	} catch {
		return undefined;
	}
}

function writeTranslateMeta(meta: TranslateMeta) {
	fs.writeFileSync(translateMetaPath, JSON.stringify(meta, undefined, 2));
}

function buildTranslate() {
	const texts = readTexts();

	const translateMap: Record<string, string> = {};

	for (const text of Object.values(texts)) {
		const translate = getTextTranslate(text);
		if (!translate) {
			continue;
		}

		translateMap[getTextOriginal(text)] = translate;
	}

	const translateJson = JSON.stringify(translateMap, null, "\t");
	const translateSortedJson = JSON.stringify(Object.entries(translateMap).sort((a, b) => a[0].localeCompare(b[0])));
	const md5 = crypto.createHash("md5").update(translateSortedJson).digest("hex");
	const previousTranslateMeta = readTranslateMeta();
	const version = previousTranslateMeta?.md5 === md5 ? previousTranslateMeta.version : Date.now();

	fs.writeFileSync(translateJsonPath, translateJson);
	writeTranslateMeta({ md5, version });
}

buildTranslate();
