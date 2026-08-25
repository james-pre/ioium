// SPDX-License-Identifier: LGPL-3.0-or-later
/* eslint-disable @typescript-eslint/only-throw-error */

import { exec, spawnSync } from 'node:child_process';

import * as io from '../core.js';

let timeout = 1000;

export function setCommandTimeout(value: number) {
	timeout = value;
}

/**
 * Run a system command with fancy I/O like "Example... done."
 * @deprecated Use {@link trackCommand} instead, this function is unsafe.
 */
export async function runShell(message: string, command: string): Promise<string> {
	let stderr: string | undefined;

	try {
		io.start(message);
		const { promise, resolve, reject } = Promise.withResolvers<string>();
		exec(command, { timeout }, (err, stdout, _stderr) => {
			stderr = _stderr.startsWith('ERROR:') ? _stderr.slice(6).trim() : _stderr;
			if (err) reject('[command]');
			else resolve(stdout);
		});
		const value = await promise;
		io.done();
		return value;
	} catch (error: any) {
		io.done(true);
		throw error == '[command]'
			? stderr?.slice(0, 100) || 'failed.'
			: typeof error == 'object' && 'message' in error
				? error.message
				: error;
	}
}

export interface TrackCommandOptions {
	text: string;
	/** Whether to ignore the command's exit code (or which codes to ignore) */
	ignoreCode?: boolean | number[];
}

/**
 * Run a system command with fancy I/O like "Example... done."
 */
export function trackCommand(message: string, command: string, ...args: string[]): string;
export function trackCommand(options: TrackCommandOptions, command: string, ...args: string[]): string;
export function trackCommand(message: string | TrackCommandOptions, command: string, ...args: string[]): string {
	const { text, ignoreCode } = typeof message === 'string' ? { text: message, ignoreCode: false } : message;

	io.start(text);
	const result = spawnSync(command, args, { encoding: 'utf-8', timeout });

	if (result.error) {
		io.done(true);
		throw result.error;
	}

	const stderr = result.stderr.startsWith('ERROR:') ? result.stderr.slice(6).trim() : result.stderr.trim();

	if (result.status && (!ignoreCode || (Array.isArray(ignoreCode) && !ignoreCode.includes(result.status)))) {
		io.done(true);
		throw stderr.slice(0, 100) || 'failed.';
	}

	io.done();
	return result.stdout;
}

export {
	/**
	 * @deprecated use {@link runShell}
	 */
	runShell as run,
};

/** Yet another convenience function */
export function exit(message: unknown, code: number = 1): never {
	if (typeof message == 'number') {
		code = message;
		message = 'Unknown error!';
	}
	io.done(true);
	io.error(io.errorText(message));
	process.exit(code);
}
