import { logPrefix } from "../utils";
import { focusPresetPickerDropdown, getPresetPickerFilter, renderPresetDropdown } from "./picker";
import { requestRenamePreset, requestSavePreset } from "./storage-client";
import { cloneStatPresetQuery, getCurrentStatGroupQuery } from "./utils";

const modalId = "poe2-extensions-stat-preset-modal";

let modalStatIndex = -1;
let modalRenameName: string | null = null;
let modalTitle: HTMLElement | null = null;
let modalInput: HTMLInputElement | null = null;
let modalMessage: HTMLElement | null = null;

function ensureStatPresetModal(): HTMLElement | null {
	const existingModal = document.getElementById(modalId);
	if (existingModal && modalInput) return existingModal;
	if (!document.body) return null;

	const modal = document.createElement("div");
	modal.id = modalId;
	modal.className = "poe2-extensions-stat-preset-modal";
	modal.hidden = true;

	const dialog = document.createElement("div");
	dialog.className = "poe2-extensions-stat-preset-dialog";

	const title = document.createElement("h2");
	title.textContent = "保存筛选预设";

	const input = document.createElement("input");
	input.type = "text";
	input.placeholder = "请输入预设名称";
	input.autocomplete = "off";

	const message = document.createElement("p");
	message.className = "poe2-extensions-stat-preset-message";

	const actions = document.createElement("div");
	actions.className = "poe2-extensions-stat-preset-actions";

	const saveButton = document.createElement("button");
	saveButton.type = "button";
	saveButton.textContent = "保存";

	const cancelButton = document.createElement("button");
	cancelButton.type = "button";
	cancelButton.textContent = "取消";

	saveButton.addEventListener("click", () => {
		void submitStatPresetModal();
	});
	cancelButton.addEventListener("click", cancelModal);
	modal.addEventListener("click", (event) => {
		if (event.target === modal) cancelModal();
	});
	input.addEventListener("keydown", (event) => {
		if (event.key === "Enter") void submitStatPresetModal();
		if (event.key === "Escape") cancelModal();
	});

	actions.append(saveButton, cancelButton);
	dialog.append(title, input, message, actions);
	modal.appendChild(dialog);
	document.body.appendChild(modal);

	modalTitle = title;
	modalInput = input;
	modalMessage = message;

	return modal;
}

export function openSavePresetModal(statIndex: number): void {
	const modal = ensureStatPresetModal();
	if (!modalInput || !modal) return;

	modalStatIndex = statIndex;
	modalRenameName = null;
	if (modalTitle) modalTitle.textContent = "保存筛选预设";
	modalInput.value = "";
	setModalMessage("");
	modal.hidden = false;
	window.setTimeout(() => modalInput?.focus(), 0);
}

export function openRenamePresetModal(name: string): void {
	const modal = ensureStatPresetModal();
	if (!modalInput || !modal) return;

	modalStatIndex = -1;
	modalRenameName = name;
	if (modalTitle) modalTitle.textContent = "重命名筛选预设";
	modalInput.value = name;
	setModalMessage("");
	modal.hidden = false;
	window.setTimeout(() => {
		modalInput?.focus();
		modalInput?.select();
	}, 0);
}

function closeStatPresetModal(): void {
	const modal = document.getElementById(modalId);
	if (modal) modal.hidden = true;
	modalStatIndex = -1;
	modalRenameName = null;
}

export function resetStatPresetModal(): void {
	document.getElementById(modalId)?.remove();
	modalTitle = null;
	modalInput = null;
	modalMessage = null;
	modalStatIndex = -1;
	modalRenameName = null;
}

function cancelModal(): void {
	const restorePresetPickerFocus = modalRenameName !== null;
	closeStatPresetModal();

	if (restorePresetPickerFocus) focusPresetPickerDropdown();
}

async function submitStatPresetModal(): Promise<void> {
	if (!modalInput) return;

	const name = modalInput.value.trim();
	if (!name) {
		setModalMessage("请输入预设名称");
		return;
	}

	if (modalRenameName !== null) {
		await renamePreset(modalRenameName, name);
		return;
	}

	await savePreset(modalStatIndex, name);
}

async function savePreset(statIndex: number, name: string): Promise<void> {
	const query = getCurrentStatGroupQuery(statIndex);
	if (!query) return;

	try {
		const presets = await requestSavePreset({
			name,
			query: cloneStatPresetQuery(query),
		});
		renderPresetDropdown(getPresetPickerFilter(), presets);
		closeStatPresetModal();
	} catch (error) {
		setModalMessage("保存失败，请稍后重试");
		console.warn(`${logPrefix} 筛选预设保存失败`, error);
	}
}

async function renamePreset(oldName: string, newName: string): Promise<void> {
	if (oldName === newName) {
		closeStatPresetModal();
		return;
	}

	try {
		const presets = await requestRenamePreset(oldName, newName);
		renderPresetDropdown(getPresetPickerFilter(), presets);
		closeStatPresetModal();
	} catch (error) {
		setModalMessage(error instanceof Error ? error.message : "重命名失败，请稍后重试");
		console.warn(`${logPrefix} 筛选预设重命名失败`, error);
	}
}

function setModalMessage(message: string): void {
	if (modalMessage) modalMessage.textContent = message;
}
