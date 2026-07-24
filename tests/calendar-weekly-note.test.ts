import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
	CalendarWeeklyNoteCommandAdapter,
	normalizeVaultPath,
	resolveWeeklyNoteTarget,
	shouldRunDailyCheck,
	type MomentLike,
} from '../src/calendar-weekly-note';

class FakeMoment implements MomentLike {
	constructor(private readonly atWeekStart = false) {}

	clone(): MomentLike {
		return new FakeMoment(this.atWeekStart);
	}

	startOf(): MomentLike {
		return new FakeMoment(true);
	}

	format(pattern: string): string {
		if (pattern === 'YYYY-MM-DD') {
			return this.atWeekStart ? '2026-07-20' : '2026-07-23';
		}
		if (pattern === 'gggg-MM-DD 周记') {
			return '2026-07-20 周记';
		}
		return '2026-W30';
	}
}

describe('resolveWeeklyNoteTarget', () => {
	it('uses Calendar folder and format to resolve the current weekly note', () => {
		expect(
			resolveWeeklyNoteTarget(
				{
					weeklyNoteFormat: 'gggg-MM-DD 周记',
					weeklyNoteFolder: ' 3-ob工作项目\\00-周记 ',
				},
				new FakeMoment(),
			),
		).toEqual({
			dayKey: '2026-07-23',
			weekKey: '2026-07-20',
			path: '3-ob工作项目/00-周记/2026-07-20 周记.md',
		});
	});

	it('normalizes paths and adds the markdown extension once', () => {
		expect(normalizeVaultPath('/Weekly//2026-W30.md/')).toBe('Weekly/2026-W30.md');
		expect(
			resolveWeeklyNoteTarget(
				{ weeklyNoteFormat: 'gggg-[W]ww.md', weeklyNoteFolder: '' },
				new FakeMoment(),
			).path,
		).toBe('2026-W30.md');
	});
});

describe('daily gate', () => {
	it('runs at most once for the same local date', () => {
		expect(shouldRunDailyCheck(undefined, '2026-07-23')).toBe(true);
		expect(shouldRunDailyCheck('2026-07-22', '2026-07-23')).toBe(true);
		expect(shouldRunDailyCheck('2026-07-23', '2026-07-23')).toBe(false);
	});
});

describe('CalendarWeeklyNoteCommandAdapter', () => {
	it('guards Calendar availability and executes its weekly-note command', () => {
		const executeCommandById = vi.fn(() => true);
		const app = {
			plugins: {
				getPlugin: vi.fn(() => ({
					options: {
						weeklyNoteFormat: 'gggg-MM-DD 周记',
						weeklyNoteFolder: 'Weekly',
					},
				})),
			},
			commands: { executeCommandById },
		} as unknown as App;
		const adapter = new CalendarWeeklyNoteCommandAdapter(app, () => new FakeMoment());

		expect(adapter.getAvailability().available).toBe(true);
		expect(adapter.resolveCurrentTarget().path).toBe('Weekly/2026-07-20 周记.md');
		expect(adapter.executeOpenCurrent()).toBe(true);
		expect(executeCommandById).toHaveBeenCalledWith('calendar:open-weekly-note');
	});

	it('reports a disabled Calendar plugin', () => {
		const app = {
			plugins: { getPlugin: vi.fn(() => null) },
			commands: { executeCommandById: vi.fn() },
		} as unknown as App;

		expect(new CalendarWeeklyNoteCommandAdapter(app).getAvailability()).toEqual({
			available: false,
			message: 'Calendar is not enabled.',
		});
	});
});
