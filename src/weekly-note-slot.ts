import type { App, EventRef, TFile, ViewState, WorkspaceLeaf } from 'obsidian';
import {
	CalendarWeeklyNoteCommandAdapter,
	shouldRunDailyCheck,
	type WeeklyNoteTarget,
} from './calendar-weekly-note';
import type { SidebarSide, WeeklyNoteSlotSettings } from './model';
import { locateSidebarLeaf } from './sidebar-locator';

const CALENDAR_OBSERVATION_TIMEOUT_MS = 120_000;

interface PendingCalendarOpen {
	target: WeeklyNoteTarget;
	sourceLeaf: WorkspaceLeaf | null;
	sourceState: ViewState | null;
	eventRef: EventRef;
	timeoutId: number;
}

export interface WeeklyNoteSlotStatus {
	available: boolean;
	enabled: boolean;
	side: SidebarSide;
	detail: string;
	lastPath?: string;
	pending: boolean;
	sessionClosed: boolean;
}

function statePath(state: ViewState | null | undefined): string | undefined {
	const file = state?.state?.file;
	return typeof file === 'string' ? file : undefined;
}

export function leafPath(leaf: WorkspaceLeaf | null | undefined): string | undefined {
	return leaf ? statePath(leaf.getViewState()) : undefined;
}

function isMarkdownFile(value: unknown): value is TFile {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as { path?: unknown; extension?: unknown };
	return typeof candidate.path === 'string' && candidate.extension === 'md';
}

export function millisecondsUntilNextLocalDay(now: Date): number {
	const next = new Date(now);
	next.setHours(24, 0, 1, 0);
	return Math.max(1_000, next.getTime() - now.getTime());
}

export class WeeklyNoteSlotController {
	private ownedLeaf: WorkspaceLeaf | null = null;
	private pending: PendingCalendarOpen | null = null;
	private dailyTimer: number | null = null;
	private sessionClosed = false;
	private mutatingLayout = false;
	private operation: Promise<void> = Promise.resolve();

	constructor(
		private readonly app: App,
		private readonly settings: WeeklyNoteSlotSettings,
		private readonly saveSettings: () => Promise<void>,
		private readonly calendar = new CalendarWeeklyNoteCommandAdapter(app),
	) {}

	getStatus(): WeeklyNoteSlotStatus {
		const availability = this.calendar.getAvailability();
		let detail = availability.message;
		if (!this.settings.enabled) {
			detail = 'Disabled.';
		} else if (this.sessionClosed) {
			detail = 'Closed for this session. Use Restore now to reopen it.';
		} else if (this.pending) {
			detail = 'Waiting for Calendar to open or create the current weekly note.';
		} else if (this.settings.lastPath) {
			detail = `Tracking ${this.settings.lastPath}`;
		}

		return {
			available: availability.available,
			enabled: this.settings.enabled,
			side: this.settings.side,
			detail,
			lastPath: this.settings.lastPath,
			pending: this.pending !== null,
			sessionClosed: this.sessionClosed,
		};
	}

	startDailyTimer(): void {
		this.scheduleNextDailyCheck();
	}

	dispose(): void {
		if (this.dailyTimer !== null) {
			window.clearTimeout(this.dailyTimer);
			this.dailyTimer = null;
		}
		this.cancelPendingCalendarOpen();
	}

	startup(): Promise<void> {
		return this.enqueue(async () => {
			this.sessionClosed = false;
			if (!this.settings.enabled) {
				return;
			}
			await this.restoreOrRequestCurrent();
		});
	}

	checkForNewDay(): Promise<void> {
		return this.enqueue(async () => {
			if (!this.settings.enabled) {
				return;
			}

			const target = this.calendar.resolveCurrentTarget();
			if (!shouldRunDailyCheck(this.settings.lastCheckDate, target.dayKey)) {
				return;
			}

			this.settings.lastCheckDate = target.dayKey;
			await this.saveSettings();
			if (this.sessionClosed) {
				return;
			}

			const savedFile = this.getMarkdownFile(this.settings.lastPath);
			if (this.settings.resolvedWeekKey !== target.weekKey || !savedFile) {
				this.beginCalendarOpen(target);
			}
		});
	}

	setEnabled(enabled: boolean): Promise<void> {
		return this.enqueue(async () => {
			this.settings.enabled = enabled;
			this.sessionClosed = false;
			await this.saveSettings();

			if (!enabled) {
				this.cancelPendingCalendarOpen();
				this.detachOwnedLeaf();
				return;
			}
			await this.restoreOrRequestCurrent();
		});
	}

	setSide(side: SidebarSide): Promise<void> {
		return this.enqueue(async () => {
			this.settings.side = side;
			this.sessionClosed = false;
			await this.saveSettings();
			if (!this.settings.enabled) {
				return;
			}

			const file = this.getMarkdownFile(this.settings.lastPath);
			if (file) {
				await this.ensureSlot(file);
			} else {
				await this.restoreOrRequestCurrent();
			}
		});
	}

	restoreNow(): Promise<void> {
		return this.enqueue(async () => {
			this.sessionClosed = false;
			if (!this.settings.enabled) {
				this.settings.enabled = true;
				await this.saveSettings();
			}
			await this.restoreOrRequestCurrent();
		});
	}

	handleLayoutChange(): void {
		if (this.mutatingLayout || !this.ownedLeaf) {
			return;
		}
		if (!this.isLeafPresent(this.ownedLeaf)) {
			this.ownedLeaf = null;
			this.sessionClosed = true;
			this.cancelPendingCalendarOpen();
		}
	}

	private enqueue(task: () => Promise<void>): Promise<void> {
		const next = this.operation.then(task, task);
		this.operation = next.catch(() => undefined);
		return next;
	}

	private async restoreOrRequestCurrent(): Promise<void> {
		const target = this.calendar.resolveCurrentTarget();
		this.settings.lastCheckDate = target.dayKey;
		const savedFile = this.getMarkdownFile(this.settings.lastPath);
		if (this.settings.resolvedWeekKey === target.weekKey && savedFile) {
			await this.ensureSlot(savedFile);
			await this.saveSettings();
			return;
		}

		await this.saveSettings();
		this.beginCalendarOpen(target);
	}

	private beginCalendarOpen(target: WeeklyNoteTarget): void {
		if (this.pending?.target.path === target.path) {
			return;
		}
		this.cancelPendingCalendarOpen();

		const sourceLeaf = this.app.workspace.getMostRecentLeaf();
		const pending = {} as PendingCalendarOpen;
		pending.target = target;
		pending.sourceLeaf = sourceLeaf;
		pending.sourceState = sourceLeaf?.getViewState() ?? null;
		pending.eventRef = this.app.workspace.on('file-open', (file) => {
			if (file?.path !== target.path || this.pending !== pending) {
				return;
			}
			void this.enqueue(async () => {
				await this.adoptCalendarFile(file, pending);
			});
		});
		pending.timeoutId = window.setTimeout(() => {
			if (this.pending === pending) {
				this.cancelPendingCalendarOpen();
			}
		}, CALENDAR_OBSERVATION_TIMEOUT_MS);
		this.pending = pending;

		if (!this.calendar.executeOpenCurrent()) {
			this.cancelPendingCalendarOpen();
			throw new Error('Calendar could not execute its “Open weekly note” command.');
		}
	}

	private async adoptCalendarFile(file: TFile, pending: PendingCalendarOpen): Promise<void> {
		if (this.pending !== pending) {
			return;
		}
		this.cancelPendingCalendarOpen();

		const calendarLeaf = this.app.workspace.getMostRecentLeaf();
		const slotLeaf = await this.ensureSlot(file);
		this.settings.lastPath = file.path;
		this.settings.resolvedWeekKey = pending.target.weekKey;
		this.settings.lastCheckDate = pending.target.dayKey;
		await this.saveSettings();

		const sourceLeaf = pending.sourceLeaf;
		const sourceState = pending.sourceState;
		const sourceWasReplaced =
			sourceLeaf !== null &&
			sourceLeaf === calendarLeaf &&
			sourceLeaf !== slotLeaf &&
			this.isLeafPresent(sourceLeaf) &&
			leafPath(sourceLeaf) === file.path &&
			statePath(sourceState) !== file.path;

		if (sourceWasReplaced && sourceState) {
			await sourceLeaf.setViewState(sourceState);
			this.app.workspace.setActiveLeaf(sourceLeaf, { focus: false });
		}
	}

	private async ensureSlot(file: TFile): Promise<WorkspaceLeaf> {
		const desiredSide = this.settings.side;
		let target =
			this.ownedLeaf &&
			this.isLeafPresent(this.ownedLeaf) &&
			locateSidebarLeaf(this.ownedLeaf) === desiredSide
				? this.ownedLeaf
				: null;

		const previousSlot =
			this.ownedLeaf && this.isLeafPresent(this.ownedLeaf)
				? this.ownedLeaf
				: this.findRememberedSidebarLeaf();

		target ??=
			previousSlot && locateSidebarLeaf(previousSlot) === desiredSide
				? previousSlot
				: null;
		target ??= this.findSidebarLeaf(file.path, desiredSide);
		const existingLeaves = new Set<WorkspaceLeaf>();
		this.app.workspace.iterateAllLeaves((leaf) => existingLeaves.add(leaf));
		target ??=
			desiredSide === 'left'
				? this.app.workspace.getLeftLeaf(false)
				: this.app.workspace.getRightLeaf(false);
		if (!target) {
			throw new Error(`Obsidian could not create a ${desiredSide} sidebar tab.`);
		}

		const targetWasCreated = !existingLeaves.has(target);
		const previousTargetState = target.getViewState();
		try {
			await target.openFile(file, { active: false });
			if (leafPath(target) !== file.path) {
				throw new Error('Obsidian did not open the weekly note in the sidebar tab.');
			}
		} catch (error) {
			if (targetWasCreated) {
				target.detach();
			} else {
				await target.setViewState(previousTargetState);
			}
			throw error;
		}

		this.ownedLeaf = target;
		if (previousSlot && previousSlot !== target && this.isLeafPresent(previousSlot)) {
			this.mutatingLayout = true;
			try {
				previousSlot.detach();
			} finally {
				this.mutatingLayout = false;
			}
		}
		return target;
	}

	private findRememberedSidebarLeaf(): WorkspaceLeaf | null {
		const path = this.settings.lastPath;
		if (!path) {
			return null;
		}
		return (
			this.findSidebarLeaf(path, 'left') ??
			this.findSidebarLeaf(path, 'right')
		);
	}

	private findSidebarLeaf(path: string, side: SidebarSide): WorkspaceLeaf | null {
		return (
			this.app.workspace
				.getLeavesOfType('markdown')
				.find((leaf) => locateSidebarLeaf(leaf) === side && leafPath(leaf) === path) ?? null
		);
	}

	private getMarkdownFile(path: string | undefined): TFile | null {
		if (!path) {
			return null;
		}
		const file = this.app.vault.getAbstractFileByPath(path);
		return isMarkdownFile(file) ? file : null;
	}

	private isLeafPresent(candidate: WorkspaceLeaf): boolean {
		let present = false;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf === candidate) {
				present = true;
			}
		});
		return present;
	}

	private detachOwnedLeaf(): void {
		if (!this.ownedLeaf || !this.isLeafPresent(this.ownedLeaf)) {
			this.ownedLeaf = null;
			return;
		}
		this.mutatingLayout = true;
		try {
			this.ownedLeaf.detach();
			this.ownedLeaf = null;
		} finally {
			this.mutatingLayout = false;
		}
	}

	private cancelPendingCalendarOpen(): void {
		const pending = this.pending;
		if (!pending) {
			return;
		}
		this.pending = null;
		this.app.workspace.offref(pending.eventRef);
		window.clearTimeout(pending.timeoutId);
	}

	private scheduleNextDailyCheck(): void {
		if (this.dailyTimer !== null) {
			window.clearTimeout(this.dailyTimer);
		}
		this.dailyTimer = window.setTimeout(() => {
			this.dailyTimer = null;
			void this.checkForNewDay()
				.catch((error: unknown) => {
					console.error('Sidebar View Manager daily weekly-note check failed.', error);
				})
				.finally(() => {
					this.scheduleNextDailyCheck();
				});
		}, millisecondsUntilNextLocalDay(new Date()));
	}
}
