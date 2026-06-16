import { logPrefix } from "../utils";

const saveButtonClass = "poe2-extensions-stat-preset-save";
const statBodySelector = ".search-advanced-pane.brown .filter-group-header .filter-body";

export function installSaveButtons(onSave: (statIndex: number) => void, signal?: AbortSignal): void {
	const bodies = Array.from(document.querySelectorAll<HTMLElement>(statBodySelector));

	bodies.forEach((body, index) => {
		const nextElement = body.nextElementSibling;
		if (nextElement instanceof HTMLElement && nextElement.classList.contains(saveButtonClass)) {
			nextElement.dataset.statPresetIndex = String(index);
			return;
		}

		const wrapper = document.createElement("span");
		wrapper.className = `input-group-btn ${saveButtonClass}`;
		wrapper.dataset.statPresetIndex = String(index);

		const button = document.createElement("button");
		button.className = "btn";
		button.type = "button";
		button.textContent = "保存预设";
		button.addEventListener(
			"click",
			(event) => {
				handleSaveButtonClick(event, onSave);
			},
			{ signal },
		);

		wrapper.appendChild(button);
		body.insertAdjacentElement("afterend", wrapper);
	});
}

export function removeSaveButtons(): void {
	for (const element of document.querySelectorAll<HTMLElement>(`.${saveButtonClass}`)) {
		element.remove();
	}
}

function handleSaveButtonClick(event: Event, onSave: (statIndex: number) => void): void {
	const button = event.currentTarget;
	if (!(button instanceof HTMLElement)) return;

	const wrapper = button.closest<HTMLElement>(`.${saveButtonClass}`);
	const statIndex = Number(wrapper?.dataset.statPresetIndex);
	if (!Number.isInteger(statIndex) || statIndex < 0) {
		console.warn(`${logPrefix} 筛选预设保存失败：未找到筛选组序号`);
		return;
	}

	onSave(statIndex);
}
