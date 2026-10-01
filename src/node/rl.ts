import { createInterface, type Interface, type ReadLineOptions } from 'node:readline/promises';
import * as z from 'zod';
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

	rl.once('close', () => {
		if (_rl === rl) _rl = null;
	});

	rl.on('SIGINT', () => {
		rl.close();
		process.stdout.write('\n');
		process.kill(process.pid, 'SIGINT');
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

/**
 * Confirm a yes/no question
 */
export async function confirm(question?: string | null, defaultAnswer: boolean = false): Promise<boolean> {
	using rl = getReadline();
	const raw = await rl.question(`${question || 'Is this ok'} [${defaultAnswer ? 'Y/n' : 'y/N'}]: `).catch(() => null);

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
