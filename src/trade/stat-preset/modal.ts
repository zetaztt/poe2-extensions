type SaveSubmitHandler = (statIndex: number, name: string) => Promise<void> | void;
type RenameSubmitHandler = (oldName: string, newName: string) => Promise<void> | void;

const modalId = "poe2-extensions-stat-preset-modal";

let modalStatIndex = -1;
let modalRenameName: string | null = null;
let modalTitle: HTMLElement | null = null;
let modalInput: HTMLInputElement | null = null;
let modalMessage: HTMLElement | null = null;
let onSaveSubmit: SaveSubmitHandler | null = null;
let onRenameSubmit: RenameSubmitHandler | null = null;
let onRenameCancel: (() => void) | null = null;

export function installStatPresetModal(options: {
	onSave: SaveSubmitHandler;
	onRename: RenameSubmitHandler;
	onRenameCancel: () => void;
	signal?: AbortSignal;
}): void {
	onSaveSubmit = options.onSave;
	onRenameSubmit = options.onRename;
	onRenameCancel = options.onRenameCancel;

	if (document.getElementById(modalId)) return;

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

	saveButton.addEventListener(
		"click",
		() => {
			void submitStatPresetModal();
		},
		{ signal: options.signal },
	);
	cancelButton.addEventListener("click", cancelModal, { signal: options.signal });
	modal.addEventListener(
		"click",
		(event) => {
			if (event.target === modal) cancelModal();
		},
		{ signal: options.signal },
	);
	input.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Enter") void submitStatPresetModal();
			if (event.key === "Escape") cancelModal();
		},
		{ signal: options.signal },
	);

	actions.append(saveButton, cancelButton);
	dialog.append(title, input, message, actions);
	modal.appendChild(dialog);
	document.body.appendChild(modal);

	modalTitle = title;
	modalInput = input;
	modalMessage = message;
}

export function openSavePresetModal(statIndex: number): void {
	const modal = document.getElementById(modalId);
	if (!modal || !modalInput) return;

	modalStatIndex = statIndex;
	modalRenameName = null;
	if (modalTitle) modalTitle.textContent = "保存筛选预设";
	modalInput.value = "";
	setModalMessage("");
	modal.hidden = false;
	window.setTimeout(() => modalInput?.focus(), 0);
}

export function openRenamePresetModal(name: string): void {
	const modal = document.getElementById(modalId);
	if (!modal || !modalInput) return;

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

export function closeStatPresetModal(): void {
	const modal = document.getElementById(modalId);
	if (modal) modal.hidden = true;
	modalStatIndex = -1;
	modalRenameName = null;
}

export function setStatPresetModalMessage(message: string): void {
	setModalMessage(message);
}

export function resetStatPresetModal(): void {
	document.getElementById(modalId)?.remove();
	modalTitle = null;
	modalInput = null;
	modalMessage = null;
	modalStatIndex = -1;
	modalRenameName = null;
	onSaveSubmit = null;
	onRenameSubmit = null;
	onRenameCancel = null;
}

function cancelModal(): void {
	const restorePresetPickerFocus = modalRenameName !== null;
	closeStatPresetModal();

	if (restorePresetPickerFocus) onRenameCancel?.();
}

async function submitStatPresetModal(): Promise<void> {
	if (!modalInput) return;

	const name = modalInput.value.trim();
	if (!name) {
		setModalMessage("请输入预设名称");
		return;
	}

	if (modalRenameName !== null) {
		await onRenameSubmit?.(modalRenameName, name);
		return;
	}

	await onSaveSubmit?.(modalStatIndex, name);
}

function setModalMessage(message: string): void {
	if (modalMessage) modalMessage.textContent = message;
}
