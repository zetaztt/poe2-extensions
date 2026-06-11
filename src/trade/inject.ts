import { isPoeTradeMessage, type TradeFeatures } from './messages';
import { setTradeItemCopyEnabled } from './item-copy/inject';
import { installTradeTranslate } from './translate/inject';

let currentFeatures: TradeFeatures = {
	translate: false,
	itemCopy: false,
};

export function injectTrade(): void {
	if (window.location.hostname !== 'www.pathofexile.com' || !window.location.pathname.startsWith('/trade2')) {
		return;
	}

	if ((document.querySelector('meta[property="og:site_name"') as HTMLMetaElement)?.content !== "Path of Exile") {
		return;
	}

	window.addEventListener('message', (event: MessageEvent<unknown>) => {
		if (event.source !== window || !isPoeTradeMessage(event.data)) return;
		applyTradeFeatures(event.data.features);
	});
}

function applyTradeFeatures(features: TradeFeatures): void {
	currentFeatures = features;

	if (features.translate) {
		installTradeTranslate();
	}

	setTradeItemCopyEnabled(features.itemCopy);
}

export function getCurrentTradeFeatures(): TradeFeatures {
	return currentFeatures;
}
