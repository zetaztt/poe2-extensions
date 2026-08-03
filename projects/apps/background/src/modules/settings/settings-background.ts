import browser from "webextension-polyfill";
import { ipcMain } from "../../background-ipc-channels";
import {
	settingsIpcProtocol,
	type AnySettingMember,
	type SettingMemberSnapshot,
	type SettingMemberValue,
	type SettingValueSnapshot,
} from "@poe2-extensions/core/settings";

const settingsStorage = browser.storage.sync;
// 缓存是当前 service worker 生命周期内的权威状态；instanceId 和 revision 让消费者隔离重启及乱序消息。
const settingsInstanceId = createId();
const settingsByKey = new Map<string, SettingCacheEntry>();
const changeRegistrationsByKey = new Map<string, SettingChangeRegistration>();
let settingsRevision = 0;
let installed = false;

interface SettingCacheEntry {
	value: unknown;
	loaded: boolean;
	loadPromise?: Promise<unknown>;
	// changeRevision 跟踪任意来源的权威值变化；write revision 只跟踪本 worker 发起的待持久化版本。
	changeRevision: number;
	writeRevision: number;
	// 保存失败通知必须关联发起写入时的 snapshot，而不能使用之后被其他 key 推进的全局 revision。
	writeSnapshotRevision: number;
	persistedWriteRevision: number;
	// 每个 key 同时只允许一个 storage 写入；期间的新版本由完成分支继续补写。
	savePromise: Promise<void> | null;
}

type SettingsChangedListener = (snapshot: SettingValueSnapshot) => void | Promise<void>;

interface SettingChangeRegistration {
	member: AnySettingMember;
	listeners: Set<SettingsChangedListener>;
}

function install(): void {
	if (installed) throw new Error("settings background 已安装");
	installed = true;
	ipcMain.handle(settingsIpcProtocol.get, ({ key, defaultValue }) => getByKey(key, defaultValue));
	ipcMain.handle(settingsIpcProtocol.getValues, ({ settings }) =>
		Promise.all(settings.map(({ key, defaultValue }) => getByKey(key, defaultValue))),
	);
	browser.storage.onChanged.addListener(handleStorageChanged);
}

function get<TMember extends AnySettingMember>(member: TMember): Promise<SettingMemberSnapshot<TMember>> {
	return getByKey<TMember["key"], SettingMemberValue<TMember>>(
		member.key,
		member.defaultValue as SettingMemberValue<TMember>,
	);
}

async function getByKey<TKey extends string, TValue>(
	key: TKey,
	defaultValue: TValue,
): Promise<SettingValueSnapshot<TKey, TValue>> {
	const entry = getEntry(key);
	if (!entry.loaded) await loadValue(key, entry, defaultValue);
	// 消费者按 key 排序快照；读取不能借用其他设置推进的全局 revision，否则会误丢本 key 的通知。
	return createSnapshot(key, entry.value as TValue, entry.changeRevision);
}

async function set<TMember extends AnySettingMember>(
	member: TMember,
	value: SettingMemberValue<TMember>,
): Promise<SettingMemberSnapshot<TMember>> {
	const entry = getEntry(member.key);
	await get(member);
	// 内存缓存是当前 service worker 的权威状态，页面更新不等待可能较慢的 storage.sync。
	const snapshot = applyValue(member.key, entry, value);
	entry.writeRevision += 1;
	entry.writeSnapshotRevision = snapshot.revision;
	scheduleSave(member.key, entry);
	return snapshot;
}

function onChanged<TMember extends AnySettingMember>(
	member: TMember,
	listener: (snapshot: SettingMemberSnapshot<TMember>) => void | Promise<void>,
): () => void {
	// storage 删除事件不携带默认值；保留 member 才能恢复默认值并使用领域定义的相等规则。
	let registration = changeRegistrationsByKey.get(member.key);
	if (!registration) {
		registration = { member, listeners: new Set() };
		changeRegistrationsByKey.set(member.key, registration);
	} else if (registration.member !== member) {
		throw new Error(`设置 key 已绑定到其他成员: ${member.key}`);
	}

	// registration 已用同一个 member 固定 key/value 关系，存入异构集合时才擦除具体值类型。
	const changedListener = listener as SettingsChangedListener;
	registration.listeners.add(changedListener);
	return () => {
		registration.listeners.delete(changedListener);
		if (registration.listeners.size === 0) changeRegistrationsByKey.delete(member.key);
	};
}

function getEntry(key: string): SettingCacheEntry {
	let entry = settingsByKey.get(key);
	if (!entry) {
		entry = {
			value: undefined,
			loaded: false,
			changeRevision: 0,
			writeRevision: 0,
			writeSnapshotRevision: 0,
			persistedWriteRevision: 0,
			savePromise: null,
		};
		settingsByKey.set(key, entry);
	}
	return entry;
}

function handleStorageChanged(changes: Record<string, { newValue?: unknown }>, areaName: string): void {
	if (areaName !== "sync") return;

	for (const [key, change] of Object.entries(changes)) {
		// 只有显式订阅的领域设置才具备默认值和副作用处理器，其他 sync 数据不属于本模块。
		const registration = changeRegistrationsByKey.get(key);
		if (!registration) continue;
		applyStorageChange(key, getEntry(key), registration, change);
	}
}

function applyStorageChange(
	key: string,
	entry: SettingCacheEntry,
	registration: SettingChangeRegistration,
	change: { newValue?: unknown },
): void {
	const value = Object.hasOwn(change, "newValue") ? change.newValue : registration.member.defaultValue;
	if (entry.loaded && registration.member.equals(entry.value, value)) return;

	const snapshot = applyValue(key, entry, value);
	for (const listener of registration.listeners) {
		try {
			void Promise.resolve(listener(snapshot)).catch(logListenerError);
		} catch (error) {
			logListenerError(error);
		}
	}
}

function loadValue(key: string, entry: SettingCacheEntry, defaultValue: unknown): Promise<unknown> {
	if (entry.loadPromise) return entry.loadPromise;

	entry.loadPromise = settingsStorage
		.get(key)
		.then((values) => {
			// 加载期间到达的 storage change 已经更新了权威缓存，不能再被较旧的读取结果覆盖。
			if (!entry.loaded) {
				entry.value = Object.hasOwn(values, key) ? values[key] : defaultValue;
				entry.loaded = true;
			}
			return entry.value;
		})
		.finally(() => {
			entry.loadPromise = undefined;
		});
	return entry.loadPromise;
}

function applyValue<TKey extends string, TValue>(
	key: TKey,
	entry: SettingCacheEntry,
	value: TValue,
): SettingValueSnapshot<TKey, TValue> {
	if (entry.loaded && Object.is(entry.value, value)) {
		return createSnapshot(key, entry.value as TValue, entry.changeRevision);
	}

	entry.value = value;
	entry.loaded = true;
	settingsRevision += 1;
	entry.changeRevision = settingsRevision;
	const snapshot = createSnapshot(key, value, entry.changeRevision);
	void ipcMain.send(settingsIpcProtocol.onChanged, snapshot);
	return snapshot;
}

function scheduleSave(key: string, entry: SettingCacheEntry): void {
	if (entry.savePromise) return;

	const attemptedWriteRevision = entry.writeRevision;
	const attemptedChangeRevision = entry.changeRevision;
	const attemptedSnapshotRevision = entry.writeSnapshotRevision;
	// 设置值未来可为对象；独立快照避免后续内存修改改变正在持久化的版本。
	const value = structuredClone(entry.value);
	let saveSucceeded = false;
	let saveError: unknown;

	entry.savePromise = settingsStorage
		.set({ [key]: value })
		.then(() => {
			entry.persistedWriteRevision = attemptedWriteRevision;
			saveSucceeded = true;
		})
		.catch((error: unknown) => {
			saveError = error;
			console.error("[poe2-extensions] 设置异步保存失败", error);
		})
		.finally(() => {
			entry.savePromise = null;
			const changedDuringSave = entry.writeRevision > attemptedWriteRevision;
			const hasNewerUnpersistedRevision = entry.writeRevision > entry.persistedWriteRevision;
			// 旧版本成功或失败都不能结束队列；只要出现更新的本地版本，就继续保存最新快照。
			if ((saveSucceeded || changedDuringSave) && hasNewerUnpersistedRevision) {
				scheduleSave(key, entry);
				return;
			}

			const supersededByExternalChange = entry.changeRevision > attemptedChangeRevision;
			// 外部同步已经取代本次失败值时，报告旧失败会误导用户当前状态仍未持久化。
			if (!saveSucceeded && !supersededByExternalChange) {
				void ipcMain.send(settingsIpcProtocol.persistenceFailed, {
					instanceId: settingsInstanceId,
					revision: attemptedSnapshotRevision,
					key,
					message: saveError instanceof Error ? saveError.message : "设置尚未保存到同步存储。",
				});
			}
		});
}

function createSnapshot<TKey extends string, TValue>(
	key: TKey,
	value: TValue,
	revision: number,
): SettingValueSnapshot<TKey, TValue> {
	return {
		instanceId: settingsInstanceId,
		revision,
		key,
		value,
	};
}

function createId(): string {
	return crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function logListenerError(error: unknown): void {
	console.warn("[poe2-extensions] 设置变化处理失败", error);
}

/**
 * 当前 service worker 生命周期内持有权威设置缓存、revision 和串行持久化队列的领域单例。
 */
export const settingsBackground = {
	install,
	get,
	set,
	onChanged,
};
