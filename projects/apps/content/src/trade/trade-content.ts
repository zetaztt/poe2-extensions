import { bootstrapContentScript, injectExtensionScript } from "../content-script";

async function injectTradeFeatureScripts(): Promise<void> {
	const injectPaths = [
		"projects/apps/inject/src/trade/item-code/trade-item-code-inject.js",
		"projects/apps/inject/src/trade/stat-preset/trade-stat-preset-inject.js",
	];
	const injectPromises: Promise<void>[] = [];

	for (const path of injectPaths) {
		injectPromises.push(
			injectExtensionScript(path, { keepInDom: true })
				.then(() => undefined)
				.catch((error) => {
					console.error(`[poe2-extensions][trade] 主世界脚本注入失败: ${path}`, error);
				}),
		);
	}

	await Promise.all(injectPromises);
}

bootstrapContentScript(async () => {
	await injectTradeFeatureScripts();
});
