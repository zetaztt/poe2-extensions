import { logPrefix } from "../trade-utils";

/**
 * 官方 trade2 数据缓存中必须隔离到中文 namespace 的稳定 key 列表。
 * 既有 `_zh` 后缀属于持久化兼容约定。
 */
export const redirectLocalStorageKeys = [
	"lscache-trade2data",
	"lscache-trade2data-cacheexpiration",
	"lscache-trade2filters",
	"lscache-trade2filters-cacheexpiration",
	"lscache-trade2items",
	"lscache-trade2items-cacheexpiration",
	"lscache-trade2stats",
	"lscache-trade2stats-cacheexpiration",
] as const;

/**
 * 仅重定向官方 trade2 数据缓存，其他页面 localStorage key 保持原样。
 */
export function redirectLocalStorageKey(key: string): string {
	return redirectLocalStorageKeys.includes(key as (typeof redirectLocalStorageKeys)[number]) ? `${key}_zh` : key;
}

/**
 * 在 MAIN world 覆盖 Storage 原型，使官方脚本透明读写中文缓存。
 * 当前 hook 不支持卸载，页面刷新后恢复。
 */
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
