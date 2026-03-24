import { spawn } from 'node:child_process';
import * as jobs from '../jobs.js';
import { styleText } from 'node:util';
import { errorText } from '../core.js';
import type { Readable } from 'node:stream';
export * from '../jobs.js';

const isTTY = !!process.stdout.isTTY && !!process.stderr.isTTY;

jobs.useClear(lastDrawLineCount => {
	process.stdout.moveCursor(0, -lastDrawLineCount);
	process.stdout.clearScreenDown();
});

jobs.useDraw((lines: string[]) => {
	for (const line of lines) process.stdout.write(line + '\n');
});

jobs.useResultFormat(result =>
	result.status == 'failed'
		? styleText('red', result.text?.toString() ?? 'failed')
		: (result.text?.toString() ?? styleText('green', 'done'))
);

if (!isTTY) jobs._disableInPlaceUpdates();

export interface CommandData {
	argv: string[];
	name?: string;
}

export interface CommandOptions extends jobs.Options {
	parseLine?(rawLine: string, isStderr: boolean): string;
	successText?: string;
}

async function runCommand(
	this: CommandOptions,
	data: CommandData,
	progress: (...args: any[]) => void
): Promise<jobs.JobResult> {
	const [command, ...args] = data.argv;
	const options = this;

	const child = spawn(command, args, {
		stdio: [
			'ignore',
			// stdout: ignore in TTY mode (we synthesize our own status), inherit otherwise
			isTTY ? 'pipe' : 'inherit',
			// stderr: parse in TTY mode, inherit otherwise
			isTTY ? 'pipe' : 'inherit',
		],
	});

	let failText: string | null = null,
		failSetFromThrow = false;

	function handleStream(stream: Readable | null, isErr: boolean) {
		if (!isTTY || !stream) return;
		let buf = '';
		stream.on('data', (chunk: Buffer) => {
			buf += chunk.toString('utf8');
			const lines = buf.split(/[\r\n]+/);
			buf = lines.pop() ?? '';
			for (const rawLine of lines) {
				let line = rawLine.trim();

				if (!line) continue;

				try {
					line = options.parseLine?.(line, isErr) ?? line;
					if (isErr && !failSetFromThrow) failText = line;
				} catch (e) {
					line = errorText(e);
					failText = line;
					failSetFromThrow = true;
				}

				progress(line);
			}
		});
	}

	handleStream(child.stdout, false);
	handleStream(child.stderr, true);

	const { promise: close, resolve } = Promise.withResolvers<number | null>();
	child.on('close', resolve);
	const code = await close;

	return code === 0
		? { status: 'succeeded', text: options.successText ?? 'done' }
		: { status: 'failed', text: failText ?? (code ? `failed (${code})` : 'failed') };
}

export async function runCommands(options: CommandOptions, commands: CommandData[]) {
	return await jobs.runWithData(
		{
			...options,
			jobStartText: styleText('cyan', 'starting...'),
			run: runCommand.bind(options),
			name: cmd => cmd.name,
		},
		commands
	);
}
