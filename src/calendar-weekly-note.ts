import type { App } from 'obsidian';

export const CALENDAR_PLUGIN_ID = 'calendar';
export const OPEN_WEEKLY_NOTE_COMMAND_ID = 'calendar:open-weekly-note';
const DEFAULT_WEEKLY_NOTE_FORMAT = 'gggg-[W]ww';

export interface MomentLike {
	clone(): MomentLike;
	startOf(unit: 'week'): MomentLike;
	format(pattern: string): string;
}

interface CalendarOptions {
	weeklyNoteFormat?: unknown;
	weeklyNoteFolder?: unknown;
}

interface CalendarPluginLike {
	options?: CalendarOptions;
}

interface PluginManagerLike {
	getPlugin(id: string): unknown;
}

interface CommandManagerLike {
	executeCommandById: (id: string) => boolean;
}

interface AppWithInternals {
	plugins?: PluginManagerLike;
	commands?: CommandManagerLike;
}

export interface WeeklyNoteTarget {
	dayKey: string;
	weekKey: string;
	path: string;
}

export interface CalendarAvailability {
	available: boolean;
	message: string;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeVaultPath(path: string): string {
	return path
		.replaceAll('\\', '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
}

export function resolveWeeklyNoteTarget(
	options: CalendarOptions,
	now: MomentLike,
): WeeklyNoteTarget {
	const format = optionalString(options.weeklyNoteFormat) ?? DEFAULT_WEEKLY_NOTE_FORMAT;
	const folder = optionalString(options.weeklyNoteFolder) ?? '';
	const startOfWeek = now.clone().startOf('week');
	let filename = startOfWeek.format(format);
	if (!filename.endsWith('.md')) {
		filename += '.md';
	}

	return {
		dayKey: now.format('YYYY-MM-DD'),
		weekKey: startOfWeek.format('YYYY-MM-DD'),
		path: normalizeVaultPath([folder, filename].filter(Boolean).join('/')),
	};
}

export function shouldRunDailyCheck(lastCheckDate: string | undefined, dayKey: string): boolean {
	return lastCheckDate !== dayKey;
}

export class CalendarWeeklyNoteCommandAdapter {
	constructor(
		private readonly app: App,
		private readonly now: () => MomentLike = () => window.moment(),
	) {}

	getAvailability(): CalendarAvailability {
		const app = this.app as unknown as AppWithInternals;
		if (!app.plugins?.getPlugin(CALENDAR_PLUGIN_ID)) {
			return {
				available: false,
				message: 'Calendar is not enabled.',
			};
		}
		if (typeof app.commands?.executeCommandById !== 'function') {
			return {
				available: false,
				message: 'Calendar commands are unavailable in this Obsidian version.',
			};
		}
		return {
			available: true,
			message: 'Calendar controls weekly-note prompting and creation.',
		};
	}

	resolveCurrentTarget(): WeeklyNoteTarget {
		const app = this.app as unknown as AppWithInternals;
		const plugin = app.plugins?.getPlugin(CALENDAR_PLUGIN_ID) as CalendarPluginLike | null;
		if (!plugin) {
			throw new Error('Calendar is not enabled.');
		}
		return resolveWeeklyNoteTarget(plugin.options ?? {}, this.now());
	}

	executeOpenCurrent(): boolean {
		const app = this.app as unknown as AppWithInternals;
		if (typeof app.commands?.executeCommandById !== 'function') {
			return false;
		}
		return app.commands.executeCommandById(OPEN_WEEKLY_NOTE_COMMAND_ID);
	}
}
