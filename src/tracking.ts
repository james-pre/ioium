import { done, error, errorText, start } from './core.js';

/**
 * Track the execution of a thunk with appropriate I/O handling.
 * Errors thrown by the thunk are re-thrown, if you want them logged see {@link tryTrack}.
 */
export function track<T>(label: string, thunk: () => T): T;

/**
 * Track the settlement of a promise with appropriate I/O handling.
 * Rejections are re-thrown, if you want them logged see {@link tryTrack}.
 */
export function track<T>(label: string, promise: Promise<T>): Promise<T>;

export function track<T>(label: string, value: Promise<T> | (() => T)): T | Promise<T> {
	start(label);
	if (typeof value == 'function')
		try {
			const result = value();
			done();
			return result;
		} catch (e) {
			done(true);
			throw e;
		}

	return value
		.then(v => {
			done();
			return v;
		})
		.catch(e => {
			done(true);
			throw e;
		});
}

/**
 * Track the execution of a thunk with appropriate I/O handling.
 * Errors thrown by the thunk are logged, if you want them rethrown see {@link track}.
 */
export function tryTrack<T>(label: string, thunk: () => T): T | null;

/**
 * Track the settlement of a promise with appropriate I/O handling.
 * Rejections are logged, if you want them thrown see {@link track}.
 */
export function tryTrack<T>(label: string, promise: Promise<T>): Promise<T | null>;

export function tryTrack<T>(label: string, value: Promise<T> | (() => T)): T | null | Promise<T | null> {
	start(label);
	if (typeof value == 'function')
		try {
			const result = value();
			done();
			return result;
		} catch (e) {
			done(true);
			error(errorText(e));
			return null;
		}

	return value
		.then(v => {
			done();
			return v;
		})
		.catch(e => {
			done(true);
			error(errorText(e));
			return null;
		});
}
