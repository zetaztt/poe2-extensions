/**
 * 表示成功计算的 Result 分支。
 */
export interface Ok<T> {
	readonly ok: true;
	readonly value: T;
}

/**
 * 表示失败计算的 Result 分支。
 */
export interface Err<E> {
	readonly ok: false;
	readonly error: E;
}

/**
 * 使用 ok 判别成功值与显式错误，避免以异常表示预期失败。
 */
export type Result<T, E> = Ok<T> | Err<E>;

export namespace Result {
	/**
	 * 创建成功分支，可省略无返回值的 value。
	 */
	export function ok(): Ok<void>;
	export function ok<T>(value: T): Ok<T>;
	export function ok<T>(value?: T): Ok<T | void> {
		return { ok: true, value };
	}

	/**
	 * 创建携带预期错误的失败分支。
	 */
	export function err<E>(error: E): Err<E> {
		return { ok: false, error };
	}

	/**
	 * 判断 Result 是否为成功分支，并收窄为 Ok。
	 */
	export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
		return result.ok;
	}
}
