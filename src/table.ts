// SPDX-License-Identifier: LGPL-3.0-or-later
export interface TableColumn<T> {
	name?: string;
	size?: number;
	text(row: T): unknown;
	length?(row: T): number;
	/** @deprecated Include the formatting in `text` instead */
	format?(text: string, row: T): string;
	/** If set pad the start instead of the end */
	padStart?: boolean;
	/** Growth factor when there is extra space */
	grow?: number;
}

export interface TableOptions {
	/** If specified, indent by this about of spaces before each row */
	indent?: number;

	/** Customize the header formatting */
	formatHead?(text: string): string;

	/** If set do not output anything. Useful for when you want interleaved output */
	noOutput?: boolean;
}

let targetWidth: number;

export function setTableTargetWidth(width: number) {
	targetWidth = width;
}

/**
 * Matches CSI/OSC sequences: an introducer (ESC or 8-bit CSI) followed by either
 * an OSC-style payload terminated by BEL, or parameter bytes plus a final byte.
 */
const ansiRegex =
	// eslint-disable-next-line no-control-regex
	/[\u001B\u009B][[\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

let stripANSI = (text: string): string => text.replaceAll(ansiRegex, '');

export function setANSIStripper(fn: (text: string) => string) {
	stripANSI = fn;
}

/**
 * Output a table, or prepare to output a table
 */
export function table<T>(columns: TableColumn<T>[], options: TableOptions = {}, data: T[] = []): (row: T) => void {
	const nColumns = columns.length;

	for (const col of columns) {
		let max = Math.max(col.size || 0, col.name?.length || 0);
		for (const row of data)
			max = Math.max(max, col.length ? col.length(row) : stripANSI(String(col.text(row))).length);
		col.size = max;
	}

	let currentWidth = columns.reduce((sum, col) => sum + col.size!, nColumns - 1);

	const canGrow = columns.some(col => !!(col.grow ?? 1));

	while (canGrow && targetWidth && currentWidth < targetWidth) {
		for (const col of columns) {
			const extra = Math.max(0, Math.min(targetWidth - currentWidth, col.grow ?? 1));
			col.size! += extra;
			currentWidth += extra;
		}
	}

	function output(row: T) {
		const out: string[] = [];
		for (const col of columns) {
			const text = String(col.text(row));
			const padding = ' '.repeat(Math.max(0, col.size! - stripANSI(text).length));
			let formatted = col.padStart ? padding + text : text + padding;
			if (col.format) formatted = col.format(formatted, row);
			out.push(formatted);
		}
		console.log(...out);
	}

	function outputHead() {
		const out: string[] = [];
		for (const col of columns) {
			const text = String(col.name ?? '');
			let formatted = col.padStart ? text.padStart(col.size!) : text.padEnd(col.size!);
			if (options.formatHead) formatted = options.formatHead(formatted);
			out.push(formatted);
		}
		console.log(...out);
	}

	if (!options.noOutput) {
		outputHead();
		for (const row of data) output(row);
	}

	return output;
}
