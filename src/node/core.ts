// SPDX-License-Identifier: LGPL-3.0-or-later
/* eslint-disable @typescript-eslint/only-throw-error */

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
	progress(value: number, max: number, message?: any, text?: string): void {
		_progress = [value, max];
		clearLine();
		process.stdout.write(
			`${_currentOperation}... ${text || value.toString().padStart(max.toString().length) + '/' + max} ${message && value < max ? `(${message})` : ''}`
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

/**
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
	writeFileSync(path, JSON.stringify(data, null, '\t'), 'utf-8');
}
