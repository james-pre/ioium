// SPDX-License-Identifier: LGPL-3.0-or-later
export * from './core.js';
export * as jobs from './jobs.js';
export * from '../tracking.js';

import { setTableTargetWidth } from '../table.js';

if (process.stdout.isTTY) {
	setTableTargetWidth(process.stdout.columns);
	process.stdout.on('resize', () => {
		setTableTargetWidth(process.stdout.columns);
	});
}

export * from '../table.js';
