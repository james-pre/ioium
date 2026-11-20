import { clearScreenDown, cursorTo, moveCursor } from 'node:readline';
import { createInterface, type Interface, type ReadLineOptions } from 'node:readline/promises';
import * as z from 'zod';
import { _setActivePrompt } from './core.js';
import { exit } from './process.js';

export interface SetReadlineOptions extends Omit<ReadLineOptions, 'input'> {
	/**
	 * Whether to throw if the options can't be applied
	 * @experimental A breaking change may occur during a non-major release
	 */
	$required?: boolean;
}

let _rl: Interface | null,
	_rlOptions: SetReadlineOptions,
	_rlHolders = 0;

const _lines: string[] = [];

export function setReadlineOptions(options: SetReadlineOptions): boolean {
	if (_rl) {
		if (!options.$required) return false;
		throw new Error('Can not io.setReadlineOptions after already creating a readline instance.');
	}
	_rlOptions = options;
	return true;
}

/**
 * Get a readline reference. While held, this means process.stdin is ref'ed if it's a TTY.
 * A new instance is created when the previous one was closed.
 * Ctrl+C closes it and sends SIGINT to the process.
 */
export function getReadline(): Interface {
	_rlHolders++;
	process.stdin.ref?.();

	if (_rl) return _rl;

	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		..._rlOptions,
	});

	rl[Symbol.dispose] = () => {
		_rlHolders = Math.max(0, _rlHolders - 1);
		if (!_rlHolders) process.stdin.unref?.();
	};

	rl.on('line', line => _lines.push(line));

	rl.once('close', () => {
		if (_rl === rl) _rl = null;
	});

	rl.on('SIGINT', () => {
		process.stdout.write('\n');
		process.kill(process.pid, 'SIGINT');
		rl.close();
	});

	_rl = rl;
	return rl;
}

/**
 * Close the readline instance, if any, so something else can read from stdin directly.
 * @internal
 */
export function closeReadline() {
	_rl?.close();
}

async function _ask(question: string, hidden: boolean): Promise<string> {
	using rl = getReadline();

	const buffered = _lines.shift();
	if (buffered !== undefined) {
		process.stdout.write(question + (hidden ? '' : buffered) + '\n');
		return buffered;
	}

	if (process.stdin.readableEnded) throw new Error('No more input');

	const controller = new AbortController();
	const onClose = () => controller.abort(new Error('No more input'));
	rl.once('close', onClose);
	_setActivePrompt({
		clear() {
			moveCursor(process.stdout, 0, -rl.getCursorPos().rows);
			cursorTo(process.stdout, 0);
			clearScreenDown(process.stdout);
		},
		redraw() {
			rl.prompt(true);
		},
	});
	try {
		return await rl.question(question, { signal: controller.signal });
	} catch (e) {
		throw controller.signal.aborted ? controller.signal.reason : e;
	} finally {
		_setActivePrompt(null);
		rl.off('close', onClose);
	}
}

/**
 * Ask a question and wait for a line of input.
 * Lines that arrived before they were asked for, like piped input, answer questions first.
 * Rejects when the input ends first.
 */
export async function ask(question: string): Promise<string> {
	return await _ask(question, false);
}

/**
 * Ask a question without showing the answer as it is typed, e.g. for passwords.
 * Otherwise behaves like {@link ask}.
 */
export async function askHidden(question: string): Promise<string> {
	if (!process.stdin.isTTY) return await _ask(question, true);

	const buffered = _lines.shift();
	if (buffered !== undefined) {
		process.stdout.write(question + '\n');
		return buffered;
	}

	if (process.stdin.readableEnded) throw new Error('No more input');

	closeReadline();
	process.stdout.write(question);
	process.stdin.setRawMode(true);
	process.stdin.resume();

	const { promise, resolve, reject } = Promise.withResolvers<string>();
	let answer = '',
		interrupted = false;

	function onData(chunk: Buffer) {
		for (const char of chunk.toString('utf8')) {
			switch (char) {
				case '\r':
				case '\n':
					return resolve(answer);
				case '\u0003':
					interrupted = true;
					return reject(new Error('Interrupted'));
				case '\u0004':
					if (!answer) return reject(new Error('No more input'));
					break;
				case '\u007f':
				case '\b':
					answer = answer.slice(0, -1);
					break;
				default:
					answer += char;
			}
		}
	}

	process.stdin.on('data', onData);
	try {
		return await promise;
	} finally {
		process.stdin.off('data', onData);
		process.stdin.setRawMode(false);
		process.stdin.pause();
		process.stdout.write('\n');
		if (interrupted) process.kill(process.pid, 'SIGINT');
	}
}

/**
 * Confirm a yes/no question
 */
export async function confirm(question?: string | null, defaultAnswer: boolean = false): Promise<boolean> {
	const raw = await ask(`${question || 'Is this ok'} [${defaultAnswer ? 'Y/n' : 'y/N'}]: `).catch(() => null);

	if (raw === null || raw === '') return defaultAnswer;

	const { data, error } = z.stringbool().default(defaultAnswer).safeParse(raw);

	return !!error || data;
}

/**
 * Assert that the answer to a question is yes, otherwise fail and exit
 */
export async function assertYes(question?: string | null, failureMessage: string = 'Aborted.'): Promise<void> {
	const yes = await confirm(question);
	if (!yes) exit(failureMessage);
}
