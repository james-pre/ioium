// SPDX-License-Identifier: LGPL-3.0-or-later

import { stripVTControlCharacters } from 'node:util';
import { setANSIStripper, setTableTargetWidth } from '../table.js';

setANSIStripper(stripVTControlCharacters);

if (process.stdout.isTTY) {
	setTableTargetWidth(process.stdout.columns);
	process.stdout.on('resize', () => {
		setTableTargetWidth(process.stdout.columns);
	});
}

export * from '../table.js';
export * from '../tracking.js';
export * from './core.js';
export * as jobs from './jobs.js';
export * from './process.js';
export * from './rl.js';
