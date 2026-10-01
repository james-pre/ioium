// SPDX-License-Identifier: LGPL-3.0-or-later

import { clearScreenDown, cursorTo, emitKeypressEvents, moveCursor, type Key } from 'node:readline';
import { styleText } from 'node:util';
import { ask, closeReadline } from './rl.js';

export interface Choice<T> {
	name: string;
	value: T;
}

/** Strings are used as both the name and value */
export type ChoiceInput<T> = Choice<T> | (T & string);

export interface SelectOptions<T> {
	/** The choice that is initially highlighted */
	default?: T;
	/** The most choices shown at once */
	pageSize?: number;
}

export interface MultiSelectOptions<T> {
	/** The choices that are initially selected */
	default?: T[];
	/** The most choices shown at once */
	pageSize?: number;
}

function normalize<T>(choices: readonly ChoiceInput<T>[]): Choice<T>[] {
	return choices.map(choice => (typeof choice == 'string' ? { name: choice, value: choice as T } : choice));
}

const isInteractive = () => !!process.stdin.isTTY && !!process.stdout.isTTY;

/**
 * Pick choices using the arrow keys, typing to filter.
 * @returns Indices of the picked choices
 */
function interactive<T>(
	question: string,
	choices: Choice<T>[],
	multi: boolean,
	initial: number[],
	pageSize: number
): Promise<number[]> {
	closeReadline();

	const { stdin, stdout } = process;
	const { promise, resolve } = Promise.withResolvers<number[]>();

	emitKeypressEvents(stdin);
	const wasRaw = stdin.isRaw;
	stdin.setRawMode(true);
	stdin.ref();
	stdin.resume();
	stdout.write('\x1b[?25l');

	const selected = new Set(multi ? initial : []);
	let cursor = multi ? 0 : (initial[0] ?? 0),
		offset = 0,
		filter = '',
		lines = 0;

	const visible = () =>
		choices.flatMap((choice, i) => (choice.name.toLowerCase().includes(filter.toLowerCase()) ? [i] : []));

	function clear() {
		if (!lines) return;
		moveCursor(stdout, 0, -(lines - 1));
		cursorTo(stdout, 0);
		clearScreenDown(stdout);
	}

	function render() {
		const items = visible();
		const size = Math.max(1, Math.min(pageSize, (stdout.rows || 24) - 2));
		const width = (stdout.columns || 80) - 6;

		cursor = Math.min(Math.max(cursor, 0), Math.max(items.length - 1, 0));
		if (cursor < offset) offset = cursor;
		if (cursor >= offset + size) offset = cursor - size + 1;
		offset = Math.max(0, Math.min(offset, items.length - size));

		const hint = multi ? 'type to filter, space to select, enter to submit' : 'type to filter, enter to select';
		const out = [styleText('bold', '? ' + question) + ' ' + (filter || styleText('dim', `[${hint}]`))];

		const end = Math.min(items.length, offset + size);
		for (let row = offset; row < end; row++) {
			const i = items[row];
			const active = row == cursor;
			const name = choices[i].name.length > width ? choices[i].name.slice(0, width - 1) + '…' : choices[i].name;
			const pointer = active ? styleText('cyan', '❯') : ' ';
			const circle = multi ? (selected.has(i) ? styleText('green', '●') : '○') + ' ' : '';
			const more = row == offset && offset > 0 ? ' ↑' : row == end - 1 && end < items.length ? ' ↓' : '';
			out.push(`  ${pointer} ${circle}${active ? styleText('cyan', name) : name}${styleText('dim', more)}`);
		}

		if (!items.length) out.push(styleText('dim', '  No matches'));

		clear();
		stdout.write(out.join('\n'));
		lines = out.length;
	}

	function cleanup() {
		stdin.off('keypress', onKeypress);
		clear();
		stdout.write('\x1b[?25h');
		stdin.setRawMode(wasRaw);
		stdin.pause();
		stdin.unref();
	}

	function submit(indices: number[]) {
		cleanup();
		const answer = indices.map(i => choices[i].name).join(', ');
		stdout.write(styleText('bold', '? ' + question) + ' ' + styleText('cyan', answer) + '\n');
		resolve(indices);
	}

	function onKeypress(text: string | undefined, key: Key = {}) {
		const items = visible();

		if (key.ctrl && key.name == 'c') {
			cleanup();
			process.kill(process.pid, 'SIGINT');
			return;
		}

		switch (key.name) {
			case 'up':
				cursor = cursor > 0 ? cursor - 1 : items.length - 1;
				break;
			case 'down':
				cursor = cursor < items.length - 1 ? cursor + 1 : 0;
				break;
			case 'pageup':
				cursor -= pageSize;
				break;
			case 'pagedown':
				cursor += pageSize;
				break;
			case 'home':
				cursor = 0;
				break;
			case 'end':
				cursor = items.length - 1;
				break;
			case 'return':
			case 'enter':
				if (multi) return submit([...selected].sort((a, b) => a - b));
				if (items.length) return submit([items[cursor]]);
				break;
			case 'space':
				if (!multi) {
					filter += ' ';
					cursor = 0;
				} else if (items.length) {
					const i = items[cursor];
					if (!selected.delete(i)) selected.add(i);
				}
				break;
			case 'backspace':
				filter = filter.slice(0, -1);
				cursor = 0;
				break;
			case 'escape':
				filter = '';
				cursor = 0;
				break;
			default:
				if (!text || key.ctrl || key.meta || text < ' ') return;
				filter += text;
				cursor = 0;
		}

		render();
	}

	stdin.on('keypress', onKeypress);
	render();

	return promise;
}

/**
 * Pick choices by typing their numbers or names, which can be partial when only one choice matches.
 * @returns Indices of the picked choices
 */
async function fallback<T>(
	question: string,
	choices: Choice<T>[],
	multi: boolean,
	initial: number[]
): Promise<number[]> {
	for (const [i, choice] of choices.entries()) console.log(`  ${i + 1}) ${choice.name}`);

	const hint = multi ? 'numbers or names, separated by commas' : 'number or name';
	const defaults = initial.length ? `, default ${initial.map(i => i + 1).join(',')}` : '';

	for (;;) {
		const answer = (await ask(`${question} [${hint}${defaults}]: `)).trim();
		if (!answer) {
			if (initial.length || multi) return initial;
			continue;
		}

		const parts = multi ? answer.split(',').map(part => part.trim()) : [answer];
		const indices = parts.map(part => {
			const n = Number(part);
			if (Number.isInteger(n) && n >= 1 && n <= choices.length) return n - 1;
			const exact = choices.findIndex(choice => choice.name.toLowerCase() == part.toLowerCase());
			if (exact != -1) return exact;
			const partial = choices.flatMap((choice, i) =>
				choice.name.toLowerCase().includes(part.toLowerCase()) ? [i] : []
			);
			return partial.length == 1 ? partial[0] : -1;
		});

		if (!indices.includes(-1)) return [...new Set(indices)];
		console.log('Invalid choice: ' + parts.filter((_, i) => indices[i] == -1).join(', '));
	}
}

/**
 * Ask the user to pick one of `choices`, using the arrow keys and enter.
 * When stdin or stdout isn't a TTY, the choices are listed and picked by number or name.
 */
export async function select<T = string>(
	question: string,
	choices: readonly ChoiceInput<T>[],
	options: SelectOptions<T> = {}
): Promise<T> {
	const normalized = normalize(choices);
	if (!normalized.length) throw new Error('Nothing to select');

	const initial = normalized.findIndex(choice => options.default !== undefined && choice.value === options.default);
	const indices = isInteractive()
		? await interactive(question, normalized, false, initial == -1 ? [] : [initial], options.pageSize ?? 10)
		: await fallback(question, normalized, false, initial == -1 ? [] : [initial]);

	return normalized[indices[0]].value;
}

/**
 * Ask the user to pick any number of `choices`, using the arrow keys, space, and enter.
 * When stdin or stdout isn't a TTY, the choices are listed and picked by number or name.
 */
export async function multiSelect<T = string>(
	question: string,
	choices: readonly ChoiceInput<T>[],
	options: MultiSelectOptions<T> = {}
): Promise<T[]> {
	const normalized = normalize(choices);
	const initial = normalized.flatMap((choice, i) => (options.default?.includes(choice.value) ? [i] : []));
	const indices = isInteractive()
		? await interactive(question, normalized, true, initial, options.pageSize ?? 10)
		: await fallback(question, normalized, true, initial);

	return indices.map(i => normalized[i].value);
}
