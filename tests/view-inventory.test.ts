import { describe, expect, it } from 'vitest';
import { deriveCandidateViewTypes, resolveCommunitySource } from '../src/view-inventory';

describe('deriveCandidateViewTypes', () => {
	it('deduplicates views and removes file-backed and system content types', () => {
		expect(
			deriveCandidateViewTypes(
				['markdown', 'outline', 'calendar', 'calendar', 'pdf', 'file-explorer'],
				['markdown', 'pdf'],
			),
		).toEqual(['calendar', 'file-explorer', 'outline']);
	});
});

describe('resolveCommunitySource', () => {
	it('uses the longest normalized plugin id match', () => {
		const manifests = [
			{ id: 'calendar', name: 'Calendar' },
			{ id: 'full-calendar', name: 'Full Calendar' },
		];
		expect(resolveCommunitySource('full-calendar-view', manifests)).toBe('Full Calendar');
	});

	it('does not match very short plugin ids', () => {
		expect(resolveCommunitySource('ai-view', [{ id: 'ai', name: 'AI' }])).toBeUndefined();
	});

	it('does not treat a short view type as a substring match', () => {
		expect(resolveCommunitySource('ai', [{ id: 'assistant-ai', name: 'Assistant AI' }])).toBeUndefined();
	});
});
