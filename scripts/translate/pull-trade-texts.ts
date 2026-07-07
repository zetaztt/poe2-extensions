import {
	clearTranslateChangesLog,
	createPulledTextContext,
	logPullTranslate,
	logTextChanges,
	poe2Href,
	pullFilterTexts,
	pullItemTexts,
	pullStatsTexts,
	pullStaticTexts,
	pullTranslateChangeLogPath,
	writeNeedCheckTexts,
} from "./trade-pull-utils";
import { getTextKey, getTextOriginal, readTexts, type TextData, writeTexts } from "./utils";

function mergePulledOriginalTexts(texts: TextData[], beforeTexts = readTexts()): TextData[] {
	return texts.map((text) => {
		const key = getTextKey(text);
		const beforeText = key ? beforeTexts[key] : undefined;
		if (beforeText) {
			beforeText.msgctxt = key;
			beforeText.msgid = getTextOriginal(text);
			return beforeText;
		}

		return text;
	});
}

function writePulledOriginalTexts(texts: TextData[]): void {
	logPullTranslate("开始合并旧翻译并写入 PO 文件");
	const beforeTexts = readTexts();
	const beforeTextsForLog = readTexts();
	const mergedTexts = mergePulledOriginalTexts(texts, beforeTexts);
	logTextChanges(pullTranslateChangeLogPath, beforeTextsForLog, mergedTexts);
	writeTexts(mergedTexts);
	logPullTranslate("PO 文件写入完成");
}

async function pullTradeTexts(): Promise<void> {
	logPullTranslate("开始清理旧日志");
	clearTranslateChangesLog(pullTranslateChangeLogPath);
	logPullTranslate(`旧日志已清理：${pullTranslateChangeLogPath}`);

	const context = createPulledTextContext();

	await Promise.all([
		pullItemTexts(context, poe2Href),
		pullStatsTexts(context, poe2Href),
		pullStaticTexts(context, poe2Href),
		pullFilterTexts(context, poe2Href),
	]);

	writePulledOriginalTexts(Array.from(context.texts.values()));
	writeNeedCheckTexts(Array.from(context.needCheckTexts.values()));
	logPullTranslate(`完成，变更日志见 ${pullTranslateChangeLogPath}`);
}

await pullTradeTexts();
