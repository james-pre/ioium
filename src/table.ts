export interface TableColumn<T> {
	name?: string;
	size?: number;
	text(row: T): unknown;
	length?(row: T): number;
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
 * Output a table, or prepare to output a table
 */
export function table<T>(columns: TableColumn<T>[], options: TableOptions = {}, data: T[] = []): (row: T) => void {
	const nColumns = columns.length;

	for (const col of columns) {
		let max = Math.max(col.size || 0, col.name?.length || 0);
		for (const row of data) max = Math.max(max, col.length ? col.length(row) : String(col.text(row)).length);
		col.size = max;
	}

	let currentWidth = columns.reduce((sum, col) => sum + col.size!, nColumns - 1);

	while (targetWidth && currentWidth < targetWidth) {
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
			let formatted = col.padStart ? text.padStart(col.size!) : text.padEnd(col.size!);
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
