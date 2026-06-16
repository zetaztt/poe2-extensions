import fs from "node:fs";
import * as csv from "csv/sync";

export const textsPath = "./data/trade-texts.csv";
export const autoTranslateTextsPath = "./data/trade-texts-atuo-translate.csv";
export const manualTranslateTextsPath = "./data/trade-texts-manual-translate.csv";

export interface TextData {
	key: string;
	original: string;
	translate: string | undefined;
	needCheck: boolean | undefined;
}

export function readTexts() {
	if (!fs.existsSync(textsPath)) {
		return {};
	}

	const backendTextsCsv = fs.readFileSync(textsPath, { encoding: "utf8" });
	return csv.parse(backendTextsCsv, {
		columns: true,
		skip_empty_lines: true,
		objname: "key",
		bom: true,
	}) as unknown as Record<string, TextData>;
}

export function writeTexts(texts: TextData[]) {
	texts.sort((a, b) => a.key.localeCompare(b.key));
	fs.writeFileSync(
		textsPath,
		csv.stringify(texts, {
			bom: true,
			header: true,
		}),
	);
}

export function readAutoTranslateTexts() {
	if (!fs.existsSync(autoTranslateTextsPath)) {
		return {};
	}

	const backendTextsCsv = fs.readFileSync(autoTranslateTextsPath, { encoding: "utf8" });
	const data = csv.parse(backendTextsCsv, {
		skip_empty_lines: true,
		bom: true,
	}) as unknown as [[string, string]];
	return Object.fromEntries(data);
}

export function writeAutoTranslateTexts(texts: [string, string][]) {
	texts.sort((a, b) => a[0].localeCompare(b[0]));
	fs.writeFileSync(
		autoTranslateTextsPath,
		csv.stringify(texts, {
			bom: true,
		}),
	);
}

export function readManualTranslateTexts() {
	if (!fs.existsSync(manualTranslateTextsPath)) {
		return {};
	}

	const manualTextsCsv = fs.readFileSync(manualTranslateTextsPath, { encoding: "utf8" });
	const data = csv.parse(manualTextsCsv, {
		skip_empty_lines: true,
		bom: true,
	}) as unknown as [[string, string]];
	return Object.fromEntries(data);
}

export function writeManualTranslateTexts(texts: [string, string][]) {
	texts.sort((a, b) => a[0].localeCompare(b[0]));
	fs.writeFileSync(
		manualTranslateTextsPath,
		csv.stringify(texts, {
			bom: true,
		}),
	);
}
