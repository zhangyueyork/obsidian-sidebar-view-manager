import { describe, expect, it } from 'vitest';
import { placementFromCounts } from '../src/sidebar-locator';

describe('placementFromCounts', () => {
	it('reports hidden when no sidebar leaves exist', () => {
		expect(placementFromCounts(0, 0)).toEqual({
			placement: 'hidden',
			hasDuplicates: false,
			leftCount: 0,
			rightCount: 0,
		});
	});

	it('prefers left for a three-state summary and reports duplicates', () => {
		expect(placementFromCounts(1, 2)).toEqual({
			placement: 'left',
			hasDuplicates: true,
			leftCount: 1,
			rightCount: 2,
		});
	});
});

