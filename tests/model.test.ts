import { describe, expect, it } from 'vitest';
import { DATA_VERSION, normalizeSettings } from '../src/model';

describe('normalizeSettings', () => {
	it('returns safe defaults for invalid data', () => {
		expect(normalizeSettings(null)).toEqual({
			version: DATA_VERSION,
			preferences: {},
			knownViews: {},
			weeklyNote: {
				enabled: false,
				side: 'right',
			},
		});
	});

	it('keeps valid preferences and metadata while dropping malformed entries', () => {
		expect(
			normalizeSettings({
				version: 99,
				preferences: {
					outline: { placement: 'right' },
					broken: { placement: 'center' },
				},
				knownViews: {
					outline: { displayName: ' Outline ', icon: 'list', source: '' },
					broken: 'nope',
				},
				weeklyNote: {
					enabled: true,
					side: 'left',
					lastPath: ' Weekly/2026-W30.md ',
					resolvedWeekKey: '2026-07-20',
					lastCheckDate: '2026-07-23',
				},
			}),
		).toEqual({
			version: DATA_VERSION,
			preferences: { outline: { placement: 'right' } },
			knownViews: { outline: { displayName: 'Outline', icon: 'list', source: undefined } },
			weeklyNote: {
				enabled: true,
				side: 'left',
				lastPath: 'Weekly/2026-W30.md',
				resolvedWeekKey: '2026-07-20',
				lastCheckDate: '2026-07-23',
			},
		});
	});
});
