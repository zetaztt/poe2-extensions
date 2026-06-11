import { logPrefix } from "../utils";

export const redirectLocalStorageKeys = [
	'lscache-trade2data',
	'lscache-trade2data-cacheexpiration',
	'lscache-trade2filters',
	'lscache-trade2filters-cacheexpiration',
	'lscache-trade2items',
	'lscache-trade2items-cacheexpiration',
	'lscache-trade2stats',
	'lscache-trade2stats-cacheexpiration',
] as const;

export function redirectLocalStorageKey(key: string): string {
	return redirectLocalStorageKeys.includes(key as (typeof redirectLocalStorageKeys)[number]) ? `${key}_zh` : key;
}

export function installLocalStorageHook(): void {
	const storagePrototype = Storage.prototype;
	const originalGetItem = storagePrototype.getItem;
	const originalSetItem = storagePrototype.setItem;
	const originalRemoveItem = storagePrototype.removeItem;

	storagePrototype.getItem = function getItem(key: string): string | null {
		return originalGetItem.call(this, redirectLocalStorageKey(key));
	};

	storagePrototype.setItem = function setItem(key: string, value: string): void {
		return originalSetItem.call(this, redirectLocalStorageKey(key), value);
	};

	storagePrototype.removeItem = function removeItem(key: string): void {
		return originalRemoveItem.call(this, redirectLocalStorageKey(key));
	};

	console.debug(`${logPrefix} localStorage 缓存键重定向已启用`);
}
