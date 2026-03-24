import * as io from './core.js';

export interface JobResult {
	status: 'succeeded' | 'failed';
	text: { toString(): string };
}

let clearActiveLines: (lastDrawLineCount: number) => void,
	drawActiveLines: (lines: string[]) => void,
	formatJobResult: (result: JobResult) => string = (result: JobResult) =>
		result.text ? result.text.toString() : result.status == 'failed' ? 'failed' : 'done',
	_noInPlaceUpdate: boolean = false;

export function useClear(clear: (lastDrawLineCount: number) => void) {
	clearActiveLines = clear;
}

export function useDraw(draw: (lines: string[]) => void) {
	drawActiveLines = draw;
}

export function useResultFormat(format: (result: JobResult) => string) {
	formatJobResult = format;
}

/** @internal */
export function _disableInPlaceUpdates() {
	_noInPlaceUpdate = true;
}

export interface Options {
	concurrency: number;
	jobStartText?: string;
}

export interface Results {
	failed: number;
	noJobs?: boolean;
}

export interface Context {
	nextIndex: number;
	remaining: number;
	failed: number;
	finished: number;
	prefix(i: number): string;
}

export interface JobContext {
	progress(this: void, ...args: any[]): void;
}

type JobFn = (context: JobContext) => JobResult | Promise<JobResult>;
export type Job = JobFn | { run: JobFn; name?: string };

interface JobInternal {
	text: string;
	index: number;
}

export async function run(options: Options, jobs: Job[]): Promise<Results> {
	if (!jobs.length) {
		return { failed: 0, noJobs: true };
	}

	const totalWidth = jobs.length.toString().length;

	const $: Context = {
		nextIndex: 0,
		remaining: jobs.length,
		failed: 0,
		finished: 0,
		prefix(i: number) {
			let prefix = `[${(i + 1).toString().padStart(totalWidth)}/${jobs.length}]`;
			if (typeof jobs[i] === 'object' && jobs[i].name) prefix += ' ' + jobs[i].name;
			return prefix;
		},
	};

	const activeJobs: JobInternal[] = [];
	let lastDrawLineCount = 0;

	function _draw() {
		if (_noInPlaceUpdate) return;
		drawActiveLines?.(activeJobs.map(j => j.text));
		lastDrawLineCount = activeJobs.length;
	}

	function _clear() {
		if (!lastDrawLineCount || _noInPlaceUpdate) return;
		clearActiveLines?.(lastDrawLineCount);
		lastDrawLineCount = 0;
	}

	async function nextJob(noInitialDraw: boolean = false) {
		if ($.nextIndex >= jobs.length) return;

		const index = $.nextIndex++;

		const job = { text: `${$.prefix(index)} ${options.jobStartText || 'starting...'}`, index };
		activeJobs.push(job);

		if (_noInPlaceUpdate) console.log(job.text);
		else if (!noInitialDraw) _draw();

		function progress(...args: any[]) {
			const line = args.join(' ').trim();
			if (!line) return;

			job.text = `${$.prefix(index)} ${line}`;

			_clear();
			_draw();
		}

		const runJob = typeof jobs[index] === 'function' ? jobs[index] : jobs[index].run;

		let result: JobResult;
		try {
			result = await runJob({ progress });
		} catch (e) {
			result = { status: 'failed', text: io.errorText(e) };
		}

		if (result.status == 'failed') $.failed++;

		_clear();

		io.log($.prefix($.finished++), formatJobResult(result));

		const jobIdx = activeJobs.indexOf(job);
		if (jobIdx === -1) throw new Error('BUG: Could not remove a job from the active jobs list');
		activeJobs.splice(jobIdx, 1);

		_draw();
		$.remaining--;

		return await nextJob();
	}

	const allDone: Promise<void>[] = [];

	for (let i = 0; i < options.concurrency; i++) {
		if ($.nextIndex >= jobs.length) break;

		allDone.push(nextJob(true));
	}

	_draw();

	await Promise.all(allDone);
	return { failed: $.failed };
}

export interface OptionsWithData<T> extends Options {
	run(data: T, progress: (...args: any[]) => void): JobResult | Promise<JobResult>;
	name?(data: T): string | undefined;
}

export async function runWithData<T>(options: OptionsWithData<T>, data: T[]) {
	return await run(
		options,
		data.map(d => ({
			run: (context: JobContext) => options.run(d, context.progress),
			name: options.name?.(d),
		}))
	);
}
