import { createInterface, type Interface } from 'node:readline/promises';
import * as z from 'zod';
import { exit } from './core.js';

const _rl = createInterface({
	input: process.stdin,
	output: process.stdout,
});

_rl[Symbol.dispose] = () => process.stdin.unref?.();

process.stdin.unref?.();

/**
 * Get a readline reference. While held, this means process.stdin is ref'ed if it's a TTY.
 */
export function getReadline(): Interface {
	process.stdin.ref?.();
	return _rl;
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
