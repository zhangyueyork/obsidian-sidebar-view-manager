export const DATA_VERSION = 2;

export const PLACEMENTS = ['left', 'right', 'hidden'] as const;

export type Placement = (typeof PLACEMENTS)[number];
export type SidebarSide = Exclude<Placement, 'hidden'>;

export interface ViewPreference {
	placement: Placement;
}

export interface KnownViewMetadata {
	displayName?: string;
	icon?: string;
	source?: string;
}

export interface WeeklyNoteSlotSettings {
	enabled: boolean;
	side: SidebarSide;
	lastPath?: string;
	resolvedWeekKey?: string;
	lastCheckDate?: string;
}

export interface SidebarViewManagerSettings {
	version: number;
	preferences: Record<string, ViewPreference>;
	knownViews: Record<string, KnownViewMetadata>;
	weeklyNote: WeeklyNoteSlotSettings;
}

export const DEFAULT_SETTINGS: SidebarViewManagerSettings = {
	version: DATA_VERSION,
	preferences: {},
	knownViews: {},
	weeklyNote: {
		enabled: false,
		side: 'right',
	},
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlacement(value: unknown): value is Placement {
	return typeof value === 'string' && PLACEMENTS.includes(value as Placement);
}

function isSidebarSide(value: unknown): value is SidebarSide {
	return value === 'left' || value === 'right';
}

function cleanOptionalString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function normalizeSettings(value: unknown): SidebarViewManagerSettings {
	if (!isRecord(value)) {
		return structuredClone(DEFAULT_SETTINGS);
	}

	const preferences: Record<string, ViewPreference> = {};
	if (isRecord(value.preferences)) {
		for (const [viewType, rawPreference] of Object.entries(value.preferences)) {
			if (!viewType || !isRecord(rawPreference) || !isPlacement(rawPreference.placement)) {
				continue;
			}
			preferences[viewType] = { placement: rawPreference.placement };
		}
	}

	const knownViews: Record<string, KnownViewMetadata> = {};
	if (isRecord(value.knownViews)) {
		for (const [viewType, rawMetadata] of Object.entries(value.knownViews)) {
			if (!viewType || !isRecord(rawMetadata)) {
				continue;
			}
			const metadata: KnownViewMetadata = {
				displayName: cleanOptionalString(rawMetadata.displayName),
				icon: cleanOptionalString(rawMetadata.icon),
				source: cleanOptionalString(rawMetadata.source),
			};
			if (metadata.displayName || metadata.icon || metadata.source) {
				knownViews[viewType] = metadata;
			}
		}
	}

	const weeklyNoteValue = isRecord(value.weeklyNote) ? value.weeklyNote : {};
	const weeklyNote: WeeklyNoteSlotSettings = {
		enabled: weeklyNoteValue.enabled === true,
		side: isSidebarSide(weeklyNoteValue.side) ? weeklyNoteValue.side : 'right',
		lastPath: cleanOptionalString(weeklyNoteValue.lastPath),
		resolvedWeekKey: cleanOptionalString(weeklyNoteValue.resolvedWeekKey),
		lastCheckDate: cleanOptionalString(weeklyNoteValue.lastCheckDate),
	};

	return {
		version: DATA_VERSION,
		preferences,
		knownViews,
		weeklyNote,
	};
}
