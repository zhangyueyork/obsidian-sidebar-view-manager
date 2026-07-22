import { describe, expect, it } from 'vitest';
import { DATA_VERSION, normalizeSettings } from '../src/model';

describe('normalizeSettings', () => {
	it('returns safe defaults for invalid data', () => {
		expect(normalizeSettings(null)).toEqual({
			version: DATA_VERSION,
			preferences: {},
			knownViews: {},
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
			}),
		).toEqual({
			version: DATA_VERSION,
			preferences: { outline: { placement: 'right' } },
			knownViews: { outline: { displayName: 'Outline', icon: 'list', source: undefined } },
		});
	});
});

