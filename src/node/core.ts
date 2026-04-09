// SPDX-License-Identifier: LGPL-3.0-or-later
/* eslint-disable @typescript-eslint/only-throw-error */

import { exec } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { styleText } from 'node:util';
import type * as z from 'zod';
import * as io from '../core.js';
export * from '../core.js';

let _currentOperation: string | null = null,
	_progress: [number, number] | null = null;

function clearLine() {
	if (!process.stdout.isTTY) return;
	process.stdout.clearLine(0);
	process.stdout.cursorTo(0);
}

function handleProgress(): Disposable {
	if (!_currentOperation) return { [Symbol.dispose]() {} };

	clearLine();

	return {
		[Symbol.dispose]() {
			process.stdout.write(_currentOperation + '... ');
			if (_progress) io.progress(..._progress);
		},
	};
}

io.useProgress({
	start(message: string): void {
		_currentOperation = message;
		process.stdout.write(message + '... ');
	},
	/** @todo implement additional messaging */
	progress(value: number, max: number, message?: any): void {
		_progress = [value, max];
		value++;
		clearLine();
		process.stdout.write(
			`${_currentOperation}... ${value.toString().padStart(max.toString().length)}/${max} ${message && value < max ? `(${message})` : ''}`
		);
		if (value >= max) {
			_currentOperation = null;
			_progress = null;
			console.log();
		}
	},
	done(noPrint?: boolean): void {
		_currentOperation = null;
		_progress = null;
		if (!noPrint) console.log('done.');
	},
});

function* maybeStyle(style: Parameters<typeof styleText>[0], parts: any[]): Generator<string> {
	for (const part of parts) {
		if (typeof part != 'string') yield part;
		else if (part.startsWith('\x1b')) yield part;
		else yield styleText(style, part);
	}
}

io.useOutput({
	error(...message: string[]): void {
		using _ = handleProgress();
		console.error(...maybeStyle('red', message));
	},
	warn(...message: string[]): void {
		using _ = handleProgress();
		console.warn(...maybeStyle('yellow', message));
	},
	info(...message: string[]): void {
		using _ = handleProgress();
		console.info(...maybeStyle('blue', message));
	},
	log(...message: string[]): void {
		using _ = handleProgress();
		console.log(...message);
	},
	debug(...message: string[]): void {
		if (!io._debugOutput) return;
		using _ = handleProgress();
		console.debug(...maybeStyle('gray', message));
	},
});

let timeout = 1000;

export function setCommandTimeout(value: number) {
	timeout = value;
}

/**
 * Run a system command with fancy I/O like "Example... done."
 */
export async function run(message: string, command: string): Promise<string> {
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
		throw error == '[command]'
			? stderr?.slice(0, 100) || 'failed.'
			: typeof error == 'object' && 'message' in error
				? error.message
				: error;
	}
}

/** Yet another convenience function */
export function exit(message: unknown, code: number = 1): never {
	if (typeof message == 'number') {
		code = message;
		message = 'Unknown error!';
	}
	io.error(io.errorText(message));
	process.exit(code);
}

/**
 *
 * @param defaultValue Returned when the file can't be loaded. If omitted, loading errors will be thrown.
 */
export function readJSON<S extends z.ZodType>(path: string, schema: S): z.infer<S> {
	try {
		const data = JSON.parse(readFileSync(path, 'utf-8'));
		return schema.parse(data);
	} catch (e) {
		throw io.errorText(e);
	}
}

export function writeJSON(path: string, data: any) {
	writeFileSync(
		path,
		JSON.stringify(data, null, 4).replaceAll(/^( {4})+/g, match => '\t'.repeat(match.length / 4)),
		'utf-8'
	);
}
