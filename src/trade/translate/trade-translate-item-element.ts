import { loadTranslateDictionary } from "../../translate-dictionary";
import { TradeStatConfig, TradeStatsGroup, Translated } from "../trade-types";

export function observeItemElement() {
	const itemObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const node of mutation.addedNodes) {
				if (node.nodeType === Node.ELEMENT_NODE) {
					if (node instanceof HTMLElement && node.classList.contains("row") && node.dataset.id) {
						translateItemElement(node);
					}
				}
			}
		}
	});

	itemObserver.observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true, // 关键：监听文本节点内容变化 (如时间动态更新)
	});
}

async function translateItemElement(itemElement: HTMLElement) {
	const statFieldElements = itemElement.querySelectorAll(`.item-mod > [data-field]`);

	for (let element of statFieldElements) {
		translateItemStatFieldText(element as HTMLSpanElement);
	}

	const dictionary = await loadTranslateDictionary();

	if (!dictionary) {
		return;
	}

	const iterator = document.createNodeIterator(itemElement, NodeFilter.SHOW_TEXT);

	// const nodes = [];
	let node: Text;
	while ((node = iterator.nextNode() as Text)) {
		const text = node.textContent ?? "";

		if (text.endsWith(": ")) {
			const textWithoutSuffix = text.slice(0, -2);
			const translatedText = dictionary[textWithoutSuffix];

			node.textContent = translatedText ? `${translatedText}: ` : text;
		} else {
			node.textContent = dictionary[text] ?? text;
		}
	}

	// console.log(nodes);
}

function translateItemStatFieldText(element: HTMLSpanElement) {
	const dataField = element.getAttribute("data-field")!;
	const id = dataField.replace("stat.", "");
	const groupId = id.split(".", 1)[0];

	const statsData = getStatsData();

	const config = statsData.find((g) => g.id === groupId)?.entries.find((e) => e.id === id);

	if (config) {
		const { _translateText } = config as Translated<TradeStatConfig>;

		if (!_translateText) return;

		const originalText = element.innerText ?? "";
		const regex = /-?\d+\.?\d*/g;
		let matchIndex = 0;
		const translatedText = _translateText.replace(/#/g, () => {
			const match = originalText.match(regex)?.[matchIndex++];
			return match ?? "#";
		});

		element.innerHTML = `${translatedText}<div style="color: #83838d;font-size: 12px;">${originalText}</div>`;
	}
}

let statsData: TradeStatsGroup[];

function getStatsData() {
	return (statsData ??= JSON.parse(localStorage.getItem("lscache-trade2stats")!));
}
