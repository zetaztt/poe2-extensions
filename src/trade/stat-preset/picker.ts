import { logPrefix } from "../utils";
import type { TradeStatPreset } from "../types";
import { openRenamePresetModal } from "./modal";
import { requestDeletePreset } from "./storage-client";
import { applyStatPreset } from "./utils";

const pickerId = "poe2-extensions-stat-preset-picker";
const hostSelector = ".multiselect.filter-select.filter-group-select";

let presetInput: HTMLInputElement | null = null;
let presetDropdown: HTMLElement | null = null;
let currentPresets: TradeStatPreset[] = [];
let observer: MutationObserver | null = null;
let refreshTimer: number | null = null;

export function installPresetPicker(): void {
	renderPresetPicker();
	ensurePresetPickerObserver();
}

export function renderPresetDropdown(filter = "", presets = currentPresets): void {
	currentPresets = presets;
	if (!presetDropdown) return;

	const normalizedFilter = filter.trim().toLowerCase();
	const filteredPresets = normalizedFilter
		? currentPresets.filter((preset) => preset.name.toLowerCase().includes(normalizedFilter))
		: currentPresets;

	presetDropdown.textContent = "";

	const group = document.createElement("li");
	group.className = "multiselect__element";

	const groupOption = document.createElement("span");
	groupOption.className = "multiselect__option multiselect__option--disabled multiselect__option--highlight";

	const groupText = document.createElement("span");
	groupText.textContent = "已保存預設";

	groupOption.appendChild(groupText);
	group.appendChild(groupOption);
	presetDropdown.appendChild(group);

	if (filteredPresets.length === 0) {
		const empty = document.createElement("li");

		const emptyOption = document.createElement("span");
		emptyOption.className = "multiselect__option";

		const emptyText = document.createElement("span");
		emptyText.textContent = "無符合道具.";

		emptyOption.appendChild(emptyText);
		empty.appendChild(emptyOption);
		presetDropdown.appendChild(empty);
		return;
	}

	for (const preset of filteredPresets) {
		const item = document.createElement("li");
		item.className = "multiselect__element";

		const option = document.createElement("span");
		option.className = "multiselect__option";
		option.dataset.select = "";
		option.dataset.selected = "";
		option.dataset.deselect = "";
		option.addEventListener("mousedown", (event) => {
			event.preventDefault();
			applyStatPreset(preset);
			hidePresetDropdown();
		});

		const label = document.createElement("span");
		label.className = "poe2-extensions-stat-preset-item-label";
		label.textContent = preset.name;

		const renameButton = document.createElement("button");
		renameButton.type = "button";
		renameButton.className = "poe2-extensions-stat-preset-rename";
		renameButton.title = "重命名预设";
		renameButton.addEventListener("mousedown", stopPresetActionEvent);
		renameButton.addEventListener("click", (event) => {
			event.stopPropagation();
			openRenamePresetModal(preset.name);
		});

		const deleteButton = document.createElement("button");
		deleteButton.type = "button";
		deleteButton.className = "poe2-extensions-stat-preset-delete";
		deleteButton.title = "删除预设";
		deleteButton.addEventListener("mousedown", stopPresetActionEvent);
		deleteButton.addEventListener("click", (event) => {
			event.stopPropagation();
			void deletePreset(preset.name);
		});

		option.append(label, renameButton, deleteButton);
		item.appendChild(option);
		presetDropdown.appendChild(item);
	}
}

export function focusPresetPickerDropdown(): void {
	window.setTimeout(() => {
		if (!presetInput) return;
		presetInput.focus();
		renderPresetDropdown(presetInput.value);
		showPresetDropdown();
	}, 0);
}

export function showPresetDropdown(): void {
	const dropdown = presetDropdown?.closest<HTMLElement>(".multiselect__content-wrapper");
	if (dropdown) dropdown.style.display = "block";

	const multiselect = presetDropdown?.closest<HTMLElement>(".multiselect.filter-select.filter-group-select");
	multiselect?.classList.add("multiselect--active");
}

export function hidePresetDropdown(): void {
	const dropdown = presetDropdown?.closest<HTMLElement>(".multiselect__content-wrapper");
	if (dropdown) dropdown.style.display = "none";

	const multiselect = presetDropdown?.closest<HTMLElement>(".multiselect.filter-select.filter-group-select");
	multiselect?.classList.remove("multiselect--active");
}

export function getPresetPickerFilter(): string {
	return presetInput?.value ?? "";
}

export function removePresetPicker(): void {
	observer?.disconnect();
	observer = null;

	if (refreshTimer !== null) {
		window.clearTimeout(refreshTimer);
		refreshTimer = null;
	}

	document.getElementById(pickerId)?.remove();
	presetInput = null;
	presetDropdown = null;
	currentPresets = [];
}

function ensurePresetPickerObserver(): void {
	if (observer || !document.body) return;

	observer = new MutationObserver(() => {
		if (refreshTimer !== null) return;

		refreshTimer = window.setTimeout(() => {
			refreshTimer = null;
			renderPresetPicker(false);
		}, 100);
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}

function renderPresetPicker(refreshExisting = true): void {
	if (document.getElementById(pickerId)) {
		if (refreshExisting) renderPresetDropdown(presetInput?.value ?? "");
		return;
	}

	const host = document.querySelector<HTMLElement>(hostSelector);
	const statsContainer = host?.closest("span")?.closest("div");
	if (!statsContainer) return;

	const container = document.createElement("span");
	container.id = pickerId;
	container.className = "filter-body poe2-extensions-stat-preset-picker";
	container.style.width = "50%";
	container.style.marginLeft = "50%";

	const multiselect = document.createElement("div");
	multiselect.tabIndex = -1;
	multiselect.className = "multiselect filter-select filter-group-select";

	const select = document.createElement("div");
	select.className = "multiselect__select";

	const tags = document.createElement("div");
	tags.className = "multiselect__tags";

	const tagsWrap = document.createElement("div");
	tagsWrap.className = "multiselect__tags-wrap";
	tagsWrap.style.display = "none";

	const spinner = document.createElement("div");
	spinner.className = "multiselect__spinner";
	spinner.style.display = "none";

	const input = document.createElement("input");
	input.name = "";
	input.type = "text";
	input.className = "multiselect__input";
	input.placeholder = "+ 已保存的组合";
	input.autocomplete = "off";

	const contentWrapper = document.createElement("div");
	contentWrapper.className = "multiselect__content-wrapper";
	contentWrapper.style.maxHeight = "300px";
	contentWrapper.style.display = "none";

	const content = document.createElement("ul");
	content.className = "multiselect__content";
	content.style.display = "inline-block";

	input.addEventListener("input", () => {
		renderPresetDropdown(input.value);
		showPresetDropdown();
	});
	input.addEventListener("focus", () => {
		renderPresetDropdown(input.value);
		showPresetDropdown();
	});
	input.addEventListener("blur", hidePresetDropdown);

	multiselect.addEventListener("mousedown", (event) => {
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (contentWrapper.contains(target)) return;
		if (target !== input) event.preventDefault();

		input.focus();
		renderPresetDropdown(input.value);
		showPresetDropdown();
	});

	tags.append(tagsWrap, spinner, input);
	contentWrapper.appendChild(content);
	multiselect.append(select, tags, contentWrapper);
	container.appendChild(multiselect);
	statsContainer.appendChild(container);
	presetInput = input;
	presetDropdown = content;
	renderPresetDropdown();
}

async function deletePreset(name: string): Promise<void> {
	try {
		const presets = await requestDeletePreset(name);
		renderPresetDropdown(getPresetPickerFilter(), presets);
		focusPresetPickerDropdown();
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设删除失败`, error);
	}
}

function stopPresetActionEvent(event: Event): void {
	event.preventDefault();
	event.stopPropagation();
}
