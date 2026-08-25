// Pending https://github.com/colinhacks/zod/pull/5928

import type { PartialRecursive } from 'utilium';
import * as z from 'zod';
import { warn, debug } from './core.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import EventEmitter from 'node:events';

export interface LoadOptions {
	/**
	 * If enabled, the config file will still be loaded if it does not match the schema.
	 */
	loose?: boolean;

	/**
	 * If enabled, the config file will be skipped if it does not exist.
	 */
	optional?: boolean;

	/**
	 * If `optional`, this function will be called with the error if the config file is invalid or can't be read.
	 */
	onError?(error: Error): void;

	/**
	 * Used to mark included files
	 * @internal
	 */
	[kWasIncluded]?: boolean;
}

const kWasIncluded = Symbol.for('_wasIncluded');

export interface ManagerOptions {
	enableIncludes?: boolean;
}

const include = z.string().array().optional();

function _allowIncludes(options: ManagerOptions): options is { enableIncludes: true } {
	return !!options.enableIncludes;
}

/**
 * Manage for configuration files
 */
export class Manager<
	Shape extends Readonly<Record<string, z.ZodType>>,
	Init extends ManagerOptions,
	LoadOpts extends LoadOptions = LoadOptions,
	out In = z.input<z.ZodObject<Shape>>,
> extends EventEmitter<{}> {
	public readonly schema: z.ZodObject<Shape>;
	public readonly fileSchema: z.DeepPartial<z.ZodObject<Shape>>;

	protected files = new Map<string, z.output<typeof this.fileSchema>>();

	/**
	 * @todo make inputs deep partial
	 *
	 */
	constructor(
		shape: Shape,
		protected options: Init
	) {
		super({ captureRejections: true });

		this.schema = z.object(shape);
		this.fileSchema = z.deepPartial(z.object(options.enableIncludes ? { ...shape, include } : shape));
	}

	async loadFile(path: string, options: LoadOpts) {
		if (this.files.has(path)) return;

		let json;
		try {
			json = JSON.parse(readFileSync(path, 'utf8'));
		} catch (e: any) {
			if (!options.optional) throw e;
			debug(`Skipping config at ${path} (${e.message})`);
			return;
		}

		let file: z.output<typeof this.fileSchema>;
		try {
			file = this.fileSchema.parse(json);
		} catch (e: any) {
			if (!options.loose) throw e;
			debug(`Loading invalid config from ${path} (${e.message})`);
			file = json;
		}

		this.files.set(path, { ...file, [kWasIncluded]: !!options[kWasIncluded] });
		await this.update(file);
		debug('Loaded config: ' + path);
		if (_allowIncludes(this.options))
			for (const include of file.include ?? [])
				await this.loadFile(resolve(dirname(path), include), {
					...options,
					optional: true,
					[kWasIncluded]: true,
				});

		// @todo dispatch event
	}

	async replaceFile(path: string, config: In) {}

	async updateFile(path: string, config: PartialRecursive<In>) {}

	async loadDefaults(options: LoadOpts) {}

	replace(config: In) {}

	async update(config: PartialRecursive<In>, global: boolean = false) {}

	async reloadConfigs() {}
}
