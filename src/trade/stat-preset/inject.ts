import { logPrefix } from '../utils';
import type { TradeStatPreset, TradeStatPresetQuery } from '../types';
import statPresetStyle from './style.css?raw';
import {
	createStatPresetDeleteMessage,
	createStatPresetListMessage,
	createStatPresetRenameMessage,
	createStatPresetSaveMessage,
	isPoeStatPresetResponseMessage,
	PoeStatPresetMessageType,
	type PoeStatPresetResponseMessage,
} from './messages';

const styleId = 'poe2-extensions-stat-preset-style';
const modalId = 'poe2-extensions-stat-preset-modal';
const pickerId = 'poe2-extensions-stat-preset-picker';
const saveButtonClass = 'poe2-extensions-stat-preset-save';
const hostSelector = '.multiselect.filter-select.filter-group-select';
const statBodySelector = '.search-advanced-pane.brown .filter-group-header .filter-body';
const requestTimeoutMs = 5_000;

let enabled = false;
let observer: MutationObserver | null = null;
let abortController: AbortController | null = null;
let refreshTimer: number | null = null;
let modalStatIndex = -1;
let presetInput: HTMLInputElement | null = null;
let presetDropdown: HTMLElement | null = null;
let modalTitle: HTMLElement | null = null;
let modalInput: HTMLInputElement | null = null;
let modalMessage: HTMLElement | null = null;
let presets: TradeStatPreset[] = [];
let modalRenameName: string | null = null;

const pendingRequests = new Map<string, {
	resolve: (message: PoeStatPresetResponseMessage) => void;
	reject: (error: Error) => void;
	timeoutId: number;
}>();

export function setTradeStatPresetEnabled(nextEnabled: boolean): void {
	if (enabled === nextEnabled) {
		if (enabled) refreshStatPresetUi();
		return;
	}

	enabled = nextEnabled;

	if (enabled) {
		installStatPreset();
		return;
	}

	uninstallStatPreset();
}

function installStatPreset(): void {
	abortController = new AbortController();
	window.addEventListener('message', handleStorageResponse, { signal: abortController.signal });
	ensureBodyReady(() => {
		if (!enabled) return;
		installStyle();
		installModal();
		ensureObserver();
		refreshStatPresetUi();
		void reloadPresets();
	});
}

function uninstallStatPreset(): void {
	abortController?.abort();
	abortController = null;
	observer?.disconnect();
	observer = null;

	if (refreshTimer !== null) {
		window.clearTimeout(refreshTimer);
		refreshTimer = null;
	}

	for (const request of pendingRequests.values()) {
		window.clearTimeout(request.timeoutId);
		request.reject(new Error('筛选预设保存已关闭'));
	}
	pendingRequests.clear();

	removeStatPresetUi();
	presets = [];
	presetInput = null;
	presetDropdown = null;
	modalTitle = null;
	modalInput = null;
	modalMessage = null;
	modalStatIndex = -1;
	modalRenameName = null;
}

function ensureBodyReady(callback: () => void): void {
	if (document.body) {
		callback();
		return;
	}

	document.addEventListener('DOMContentLoaded', callback, {
		once: true,
		signal: abortController?.signal,
	});
}

function ensureObserver(): void {
	if (observer || !document.body) return;

	observer = new MutationObserver(() => {
		if (!enabled || refreshTimer !== null) return;

		refreshTimer = window.setTimeout(() => {
			refreshTimer = null;
			refreshStatPresetUi();
		}, 100);
	});

	observer.observe(document.body, {
		childList: true,
		subtree: true,
	});
}

function refreshStatPresetUi(): void {
	if (!enabled || !document.body) return;

	installSaveButtons();
	installPresetPicker();
}

function installSaveButtons(): void {
	const bodies = Array.from(document.querySelectorAll<HTMLElement>(statBodySelector));

	bodies.forEach((body, index) => {
		const nextElement = body.nextElementSibling;
		if (nextElement instanceof HTMLElement && nextElement.classList.contains(saveButtonClass)) {
			nextElement.dataset.statPresetIndex = String(index);
			return;
		}

		const wrapper = document.createElement('span');
		wrapper.className = `input-group-btn ${saveButtonClass}`;
		wrapper.dataset.statPresetIndex = String(index);

		const button = document.createElement('button');
		button.className = 'btn';
		button.type = 'button';
		button.textContent = '保存预设';
		button.addEventListener('click', handleSaveButtonClick, {
			signal: abortController?.signal,
		});

		wrapper.appendChild(button);
		body.insertAdjacentElement('afterend', wrapper);
	});
}

function installPresetPicker(): void {
	if (document.getElementById(pickerId)) return;

	const host = document.querySelector<HTMLElement>(hostSelector);
	const statsContainer = host?.closest('span')?.closest('div');
	if (!statsContainer) return;

	const container = document.createElement('span');
	container.id = pickerId;
	container.className = 'filter-body poe2-extensions-stat-preset-picker';
	container.style.width = '50%';
	container.style.marginLeft = '50%';

	const multiselect = document.createElement('div');
	multiselect.tabIndex = -1;
	multiselect.className = 'multiselect filter-select filter-group-select';

	const select = document.createElement('div');
	select.className = 'multiselect__select';

	const tags = document.createElement('div');
	tags.className = 'multiselect__tags';

	const tagsWrap = document.createElement('div');
	tagsWrap.className = 'multiselect__tags-wrap';
	tagsWrap.style.display = 'none';

	const spinner = document.createElement('div');
	spinner.className = 'multiselect__spinner';
	spinner.style.display = 'none';

	const input = document.createElement('input');
	input.name = '';
	input.type = 'text';
	input.className = 'multiselect__input';
	input.placeholder = '+ 已保存的组合';
	input.autocomplete = 'off';

	const contentWrapper = document.createElement('div');
	contentWrapper.className = 'multiselect__content-wrapper';
	contentWrapper.style.maxHeight = '300px';
	contentWrapper.style.display = 'none';

	const content = document.createElement('ul');
	content.className = 'multiselect__content';
	content.style.display = 'inline-block';

	input.addEventListener('input', () => {
		renderPresetDropdown(input.value);
		showPresetDropdown();
	}, { signal: abortController?.signal });
	input.addEventListener('focus', () => {
		renderPresetDropdown(input.value);
		showPresetDropdown();
	}, { signal: abortController?.signal });

	multiselect.addEventListener('mousedown', (event) => {
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (contentWrapper.contains(target)) return;
		if (target !== input) event.preventDefault();

		input.focus();
		renderPresetDropdown(input.value);
		showPresetDropdown();
	}, { signal: abortController?.signal });

	document.addEventListener('click', (event) => {
		const target = event.target;
		if (!(target instanceof Node)) return;

		if (!container.contains(target)) {
			hidePresetDropdown();
			return;
		}

		if (contentWrapper.contains(target)) return;

		input.focus();
		renderPresetDropdown(input.value);
		showPresetDropdown();
	}, { signal: abortController?.signal });

	tags.append(tagsWrap, spinner, input);
	contentWrapper.appendChild(content);
	multiselect.append(select, tags, contentWrapper);
	container.appendChild(multiselect);
	statsContainer.appendChild(container);
	presetInput = input;
	presetDropdown = content;
	renderPresetDropdown();
}

function installModal(): void {
	if (document.getElementById(modalId)) return;

	const modal = document.createElement('div');
	modal.id = modalId;
	modal.className = 'poe2-extensions-stat-preset-modal';
	modal.hidden = true;

	const dialog = document.createElement('div');
	dialog.className = 'poe2-extensions-stat-preset-dialog';

	const title = document.createElement('h2');
	title.textContent = '保存筛选预设';

	const input = document.createElement('input');
	input.type = 'text';
	input.placeholder = '请输入预设名称';
	input.autocomplete = 'off';

	const message = document.createElement('p');
	message.className = 'poe2-extensions-stat-preset-message';

	const actions = document.createElement('div');
	actions.className = 'poe2-extensions-stat-preset-actions';

	const saveButton = document.createElement('button');
	saveButton.type = 'button';
	saveButton.textContent = '保存';

	const cancelButton = document.createElement('button');
	cancelButton.type = 'button';
	cancelButton.textContent = '取消';

	saveButton.addEventListener('click', () => {
		void submitStatPresetModal();
	}, { signal: abortController?.signal });
	cancelButton.addEventListener('click', cancelModal, { signal: abortController?.signal });
	modal.addEventListener('click', (event) => {
		if (event.target === modal) cancelModal();
	}, { signal: abortController?.signal });
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter') void submitStatPresetModal();
		if (event.key === 'Escape') cancelModal();
	}, { signal: abortController?.signal });

	actions.append(saveButton, cancelButton);
	dialog.append(title, input, message, actions);
	modal.appendChild(dialog);
	document.body.appendChild(modal);

	modalTitle = title;
	modalInput = input;
	modalMessage = message;
}

function handleSaveButtonClick(event: Event): void {
	const button = event.currentTarget;
	if (!(button instanceof HTMLElement)) return;

	const wrapper = button.closest<HTMLElement>(`.${saveButtonClass}`);
	const statIndex = Number(wrapper?.dataset.statPresetIndex);
	if (!Number.isInteger(statIndex) || statIndex < 0) {
		console.warn(`${logPrefix} 筛选预设保存失败：未找到筛选组序号`);
		return;
	}

	openModal(statIndex);
}

function openModal(statIndex: number): void {
	const modal = document.getElementById(modalId);
	if (!modal || !modalInput) return;

	modalStatIndex = statIndex;
	modalRenameName = null;
	if (modalTitle) modalTitle.textContent = '保存筛选预设';
	modalInput.value = '';
	setModalMessage('');
	modal.hidden = false;
	window.setTimeout(() => modalInput?.focus(), 0);
}

function openRenameModal(name: string): void {
	const modal = document.getElementById(modalId);
	if (!modal || !modalInput) return;

	modalStatIndex = -1;
	modalRenameName = name;
	if (modalTitle) modalTitle.textContent = '重命名筛选预设';
	modalInput.value = name;
	setModalMessage('');
	modal.hidden = false;
	window.setTimeout(() => {
		modalInput?.focus();
		modalInput?.select();
	}, 0);
}

function closeModal(): void {
	const modal = document.getElementById(modalId);
	if (modal) modal.hidden = true;
	modalStatIndex = -1;
	modalRenameName = null;
}

function cancelModal(): void {
	const restorePresetPickerFocus = modalRenameName !== null;
	closeModal();

	if (!restorePresetPickerFocus) return;
	window.setTimeout(() => {
		if (!presetInput) return;
		presetInput.focus();
		renderPresetDropdown(presetInput.value);
		showPresetDropdown();
	}, 0);
}

async function submitStatPresetModal(): Promise<void> {
	if (!modalInput) return;

	const name = modalInput.value.trim();
	if (!name) {
		setModalMessage('请输入预设名称');
		return;
	}

	if (modalRenameName !== null) {
		await renamePreset(modalRenameName, name);
		return;
	}

	const query = getCurrentStatGroupQuery(modalStatIndex);
	if (!query) return;

	try {
		presets = await requestSavePreset({
			name,
			query: cloneStatPresetQuery(query),
		});
		renderPresetDropdown(presetInput?.value ?? '');
		closeModal();
	} catch (error) {
		setModalMessage('保存失败，请稍后重试');
		console.warn(`${logPrefix} 筛选预设保存失败`, error);
	}
}

function getCurrentStatGroupQuery(index: number): TradeStatPresetQuery | null {
	const stats = window.app?.query?.query?.stats;
	const query = stats?.[index];

	if (!query) {
		console.warn(`${logPrefix} 筛选预设保存失败：未找到当前筛选组`, { index });
		return null;
	}

	return query;
}

function renderPresetDropdown(filter = ''): void {
	if (!presetDropdown) return;

	const normalizedFilter = filter.trim().toLowerCase();
	const filteredPresets = normalizedFilter
		? presets.filter((preset) => preset.name.toLowerCase().includes(normalizedFilter))
		: presets;

	presetDropdown.textContent = '';

	const group = document.createElement('li');
	group.className = 'multiselect__element';

	const groupOption = document.createElement('span');
	groupOption.className = 'multiselect__option multiselect__option--disabled multiselect__option--highlight';

	const groupText = document.createElement('span');
	groupText.textContent = '已保存預設';

	groupOption.appendChild(groupText);
	group.appendChild(groupOption);
	presetDropdown.appendChild(group);

	if (filteredPresets.length === 0) {
		const empty = document.createElement('li');

		const emptyOption = document.createElement('span');
		emptyOption.className = 'multiselect__option';

		const emptyText = document.createElement('span');
		emptyText.textContent = '無符合道具.';

		emptyOption.appendChild(emptyText);
		empty.appendChild(emptyOption);
		presetDropdown.appendChild(empty);
		return;
	}

	for (const preset of filteredPresets) {
		const item = document.createElement('li');
		item.className = 'multiselect__element';

		const option = document.createElement('span');
		option.className = 'multiselect__option';
		option.dataset.select = '';
		option.dataset.selected = '';
		option.dataset.deselect = '';
		option.addEventListener('click', () => applyPreset(preset), {
			signal: abortController?.signal,
		});

		const label = document.createElement('span');
		label.className = 'poe2-extensions-stat-preset-item-label';
		label.textContent = preset.name;

		const renameButton = document.createElement('button');
		renameButton.type = 'button';
		renameButton.className = 'poe2-extensions-stat-preset-rename';
		renameButton.title = '重命名预设';
		renameButton.addEventListener('mousedown', stopPresetActionEvent, {
			signal: abortController?.signal,
		});
		renameButton.addEventListener('click', (event) => {
			event.stopPropagation();
			openRenameModal(preset.name);
		}, { signal: abortController?.signal });

		const deleteButton = document.createElement('button');
		deleteButton.type = 'button';
		deleteButton.className = 'poe2-extensions-stat-preset-delete';
		deleteButton.title = '删除预设';
		deleteButton.addEventListener('mousedown', stopPresetActionEvent, {
			signal: abortController?.signal,
		});
		deleteButton.addEventListener('click', (event) => {
			event.stopPropagation();
			void deletePreset(preset.name);
		}, { signal: abortController?.signal });

		option.append(label, renameButton, deleteButton);
		item.appendChild(option);
		presetDropdown.appendChild(item);
	}
}

function stopPresetActionEvent(event: Event): void {
	event.preventDefault();
	event.stopPropagation();
}

function showPresetDropdown(): void {
	const dropdown = presetDropdown?.closest<HTMLElement>('.multiselect__content-wrapper');
	if (dropdown) dropdown.style.display = 'block';

	const multiselect = presetDropdown?.closest<HTMLElement>('.multiselect.filter-select.filter-group-select');
	multiselect?.classList.add('multiselect--active');
}

function hidePresetDropdown(): void {
	const dropdown = presetDropdown?.closest<HTMLElement>('.multiselect__content-wrapper');
	if (dropdown) dropdown.style.display = 'none';

	const multiselect = presetDropdown?.closest<HTMLElement>('.multiselect.filter-select.filter-group-select');
	multiselect?.classList.remove('multiselect--active');
}

function applyPreset(preset: TradeStatPreset): void {
	try {
		window.app?.$store.commit('pushStatGroup', cloneStatPresetQuery(preset.query));
		hidePresetDropdown();
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设应用失败`, error);
	}
}

async function deletePreset(name: string): Promise<void> {
	try {
		presets = await requestDeletePreset(name);
		renderPresetDropdown(presetInput?.value ?? '');
		presetInput?.focus();
		showPresetDropdown();
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设删除失败`, error);
	}
}

async function renamePreset(oldName: string, newName: string): Promise<void> {
	if (oldName === newName) {
		closeModal();
		return;
	}

	try {
		presets = await requestRenamePreset(oldName, newName);
		renderPresetDropdown(presetInput?.value ?? '');
		closeModal();
	} catch (error) {
		setModalMessage(error instanceof Error ? error.message : '重命名失败，请稍后重试');
		console.warn(`${logPrefix} 筛选预设重命名失败`, error);
	}
}

async function reloadPresets(): Promise<void> {
	try {
		presets = await requestPresetList();
		renderPresetDropdown(presetInput?.value ?? '');
	} catch (error) {
		console.warn(`${logPrefix} 筛选预设读取失败`, error);
	}
}

function requestPresetList(): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetListMessage(createRequestId()));
}

function requestSavePreset(preset: TradeStatPreset): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetSaveMessage(createRequestId(), preset));
}

function requestRenamePreset(oldName: string, newName: string): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetRenameMessage(createRequestId(), oldName, newName));
}

function requestDeletePreset(name: string): Promise<TradeStatPreset[]> {
	return sendStorageRequest(createStatPresetDeleteMessage(createRequestId(), name));
}

function sendStorageRequest(
	message: ReturnType<
		| typeof createStatPresetListMessage
		| typeof createStatPresetSaveMessage
		| typeof createStatPresetRenameMessage
		| typeof createStatPresetDeleteMessage
	>,
): Promise<TradeStatPreset[]> {
	return new Promise((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			pendingRequests.delete(message.requestId);
			reject(new Error('筛选预设存储无响应'));
		}, requestTimeoutMs);

		pendingRequests.set(message.requestId, {
			resolve: (response) => {
				if (response.type === PoeStatPresetMessageType.error) {
					reject(new Error(response.error.message));
					return;
				}

				resolve(response.presets);
			},
			reject,
			timeoutId,
		});

		window.postMessage(message, window.location.origin);
	});
}

function handleStorageResponse(event: MessageEvent<unknown>): void {
	if (event.source !== window || !isPoeStatPresetResponseMessage(event.data)) return;

	const pending = pendingRequests.get(event.data.requestId);
	if (!pending) return;

	pendingRequests.delete(event.data.requestId);
	window.clearTimeout(pending.timeoutId);
	pending.resolve(event.data);
}

function removeStatPresetUi(): void {
	for (const element of document.querySelectorAll<HTMLElement>(`.${saveButtonClass}, #${pickerId}, #${modalId}, #${styleId}`)) {
		element.remove();
	}
}

function installStyle(): void {
	if (document.getElementById(styleId)) return;

	const style = document.createElement('style');
	style.id = styleId;
	style.textContent = statPresetStyle;

	document.documentElement.appendChild(style);
}

function setModalMessage(message: string): void {
	if (modalMessage) modalMessage.textContent = message;
}

function createRequestId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `stat-preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneStatPresetQuery(query: TradeStatPresetQuery): TradeStatPresetQuery {
	return JSON.parse(JSON.stringify(query)) as TradeStatPresetQuery;
}
