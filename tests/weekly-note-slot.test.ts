import type { App, EventRef, TFile, ViewState, WorkspaceLeaf } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	CalendarWeeklyNoteCommandAdapter,
	type WeeklyNoteTarget,
} from '../src/calendar-weekly-note';
import type { WeeklyNoteSlotSettings } from '../src/model';
import {
	leafPath,
	millisecondsUntilNextLocalDay,
	WeeklyNoteSlotController,
} from '../src/weekly-note-slot';

function file(path: string): TFile {
	return { path, extension: 'md' } as TFile;
}

function containerFor(side: 'left' | 'right' | 'main'): HTMLElement {
	return {
		closest: (selector: string) =>
			side !== 'main' && selector.includes(`mod-${side}-split`) ? ({} as Element) : null,
	} as HTMLElement;
}

function createLeaf(path: string, side: 'left' | 'right' | 'main'): WorkspaceLeaf {
	let state: ViewState = { type: 'markdown', state: { file: path } };
	return {
		view: { containerEl: containerFor(side) },
		getViewState: vi.fn(() => structuredClone(state)),
		setViewState: vi.fn(async (next: ViewState) => {
			state = structuredClone(next);
		}),
		openFile: vi.fn(async (nextFile: TFile) => {
			state = { type: 'markdown', state: { file: nextFile.path } };
		}),
		detach: vi.fn(),
	} as unknown as WorkspaceLeaf;
}

function target(
	path = 'Weekly/2026-07-20.md',
	weekKey = '2026-07-20',
	dayKey = '2026-07-23',
): WeeklyNoteTarget {
	return { path, weekKey, dayKey };
}

function calendarAdapter(currentTarget: WeeklyNoteTarget, execute = vi.fn(() => true)) {
	return {
		getAvailability: () => ({ available: true, message: 'Calendar ready.' }),
		resolveCurrentTarget: () => currentTarget,
		executeOpenCurrent: execute,
	} as unknown as CalendarWeeklyNoteCommandAdapter;
}

function testApp(initialLeaves: WorkspaceLeaf[], files: TFile[]) {
	const leaves = [...initialLeaves];
	let activeLeaf = leaves[0] ?? null;
	let fileOpen: ((file: TFile | null) => unknown) | undefined;
	const offref = vi.fn();
	const setActiveLeaf = vi.fn((leaf: WorkspaceLeaf) => {
		activeLeaf = leaf;
	});
	const workspace = {
		getMostRecentLeaf: () => activeLeaf,
		setActiveLeaf,
		getLeavesOfType: () => leaves,
		iterateAllLeaves: (callback: (leaf: WorkspaceLeaf) => unknown) => leaves.forEach(callback),
		getLeftLeaf: vi.fn(() => {
			const leaf = createLeaf('', 'left');
			leaves.push(leaf);
			return leaf;
		}),
		getRightLeaf: vi.fn(() => {
			const leaf = createLeaf('', 'right');
			leaves.push(leaf);
			return leaf;
		}),
		on: vi.fn((name: string, callback: (file: TFile | null) => unknown) => {
			if (name === 'file-open') {
				fileOpen = callback;
			}
			return { name } as unknown as EventRef;
		}),
		offref,
	};
	const app = {
		workspace,
		vault: {
			getAbstractFileByPath: (path: string) => files.find((item) => item.path === path) ?? null,
		},
	} as unknown as App;

	return {
		app,
		leaves,
		workspace,
		setActiveLeaf,
		emitFileOpen: (opened: TFile) => fileOpen?.(opened),
		setActive: (leaf: WorkspaceLeaf) => {
			activeLeaf = leaf;
		},
	};
}

describe('WeeklyNoteSlotController', () => {
	beforeEach(() => {
		vi.stubGlobal('window', {
			setTimeout: vi.fn(() => 17),
			clearTimeout: vi.fn(),
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('restores a saved current-week path in its existing sidebar leaf', async () => {
		const weeklyFile = file('Weekly/2026-07-20.md');
		const rightLeaf = createLeaf(weeklyFile.path, 'right');
		const { app } = testApp([rightLeaf], [weeklyFile]);
		const execute = vi.fn(() => true);
		const settings: WeeklyNoteSlotSettings = {
			enabled: true,
			side: 'right',
			lastPath: weeklyFile.path,
			resolvedWeekKey: '2026-07-20',
		};
		const save = vi.fn(async () => undefined);
		const controller = new WeeklyNoteSlotController(
			app,
			settings,
			save,
			calendarAdapter(target(), execute),
		);

		await controller.startup();

		expect(rightLeaf.openFile).toHaveBeenCalledWith(weeklyFile, { active: false });
		expect(execute).not.toHaveBeenCalled();
		expect(settings.lastCheckDate).toBe('2026-07-23');
	});

	it('lets Calendar open a changed week, adopts the file, and restores the source leaf', async () => {
		const source = createLeaf('Notes/original.md', 'main');
		const weeklyFile = file('Weekly/2026-07-27.md');
		const fixture = testApp([source], [weeklyFile]);
		const execute = vi.fn(() => true);
		const settings: WeeklyNoteSlotSettings = {
			enabled: true,
			side: 'right',
			resolvedWeekKey: '2026-07-20',
			lastCheckDate: '2026-07-26',
		};
		const save = vi.fn(async () => undefined);
		const controller = new WeeklyNoteSlotController(
			fixture.app,
			settings,
			save,
			calendarAdapter(target(weeklyFile.path, '2026-07-27', '2026-07-27'), execute),
		);

		await controller.checkForNewDay();
		expect(execute).toHaveBeenCalledOnce();

		await source.openFile(weeklyFile);
		fixture.setActive(source);
		fixture.emitFileOpen(weeklyFile);

		await vi.waitFor(() => {
			expect(settings.lastPath).toBe(weeklyFile.path);
		});
		const sidebarLeaf = fixture.leaves.find((leaf) => leaf !== source);
		expect(leafPath(sidebarLeaf)).toBe(weeklyFile.path);
		expect(leafPath(source)).toBe('Notes/original.md');
		expect(fixture.setActiveLeaf).toHaveBeenCalledWith(source, { focus: false });
		expect(settings.resolvedWeekKey).toBe('2026-07-27');
	});

	it('treats removing the owned leaf as a manual close for the session', async () => {
		const weeklyFile = file('Weekly/2026-07-20.md');
		const rightLeaf = createLeaf(weeklyFile.path, 'right');
		const fixture = testApp([rightLeaf], [weeklyFile]);
		const settings: WeeklyNoteSlotSettings = {
			enabled: true,
			side: 'right',
			lastPath: weeklyFile.path,
			resolvedWeekKey: '2026-07-20',
		};
		const controller = new WeeklyNoteSlotController(
			fixture.app,
			settings,
			async () => undefined,
			calendarAdapter(target()),
		);
		await controller.startup();

		fixture.leaves.splice(0, 1);
		controller.handleLayoutChange();

		expect(controller.getStatus().sessionClosed).toBe(true);
	});

	it('keeps the previous slot when moving to the other sidebar fails', async () => {
		const weeklyFile = file('Weekly/2026-07-20.md');
		const leftLeaf = createLeaf(weeklyFile.path, 'left');
		const fixture = testApp([leftLeaf], [weeklyFile]);
		const failedTarget = createLeaf('', 'right');
		vi.mocked(failedTarget.openFile).mockRejectedValue(new Error('open failed'));
		vi.mocked(fixture.workspace.getRightLeaf).mockImplementation(() => {
			fixture.leaves.push(failedTarget);
			return failedTarget;
		});
		const settings: WeeklyNoteSlotSettings = {
			enabled: true,
			side: 'left',
			lastPath: weeklyFile.path,
			resolvedWeekKey: '2026-07-20',
		};
		const controller = new WeeklyNoteSlotController(
			fixture.app,
			settings,
			async () => undefined,
			calendarAdapter(target()),
		);
		await controller.startup();

		await expect(controller.setSide('right')).rejects.toThrow('open failed');

		expect(failedTarget.detach).toHaveBeenCalledOnce();
		expect(leftLeaf.detach).not.toHaveBeenCalled();
		expect(leafPath(leftLeaf)).toBe(weeklyFile.path);
	});
});

describe('millisecondsUntilNextLocalDay', () => {
	it('schedules one check just after the next local midnight', () => {
		const now = new Date(2026, 6, 23, 23, 59, 59, 500);
		expect(millisecondsUntilNextLocalDay(now)).toBe(1_500);
	});
});
