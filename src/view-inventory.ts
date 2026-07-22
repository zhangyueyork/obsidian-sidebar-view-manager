import type { App, PluginManifest, WorkspaceLeaf } from 'obsidian';
import { getEnabledCommunityManifests, getViewRegistry } from './compatibility';
import type { KnownViewMetadata, Placement } from './model';
import { summarizeLeafPlacement } from './sidebar-locator';

export type InventoryMode = 'registry' | 'fallback';

export interface ViewDescriptor {
	type: string;
	displayName: string;
	icon: string;
	source: string;
	currentPlacement: Placement;
	hasDuplicates: boolean;
}

export interface ViewInventorySnapshot {
	mode: InventoryMode;
	views: ViewDescriptor[];
}

const SYSTEM_VIEW_TYPES = new Set([
	'empty',
	'markdown',
	'image',
	'audio',
	'video',
	'pdf',
	'canvas',
	'webviewer',
	'release-notes',
	'changelog',
]);

const CORE_VIEW_METADATA: Record<string, KnownViewMetadata> = {
	'file-explorer': { displayName: 'File explorer', icon: 'folder', source: 'Core' },
	search: { displayName: 'Search', icon: 'search', source: 'Core' },
	backlink: { displayName: 'Backlinks', icon: 'links-coming-in', source: 'Core' },
	'outgoing-link': { displayName: 'Outgoing links', icon: 'links-going-out', source: 'Core' },
	tag: { displayName: 'Tags', icon: 'tags', source: 'Core' },
	outline: { displayName: 'Outline', icon: 'list', source: 'Core' },
	bookmarks: { displayName: 'Bookmarks', icon: 'bookmark', source: 'Core' },
	properties: { displayName: 'Properties', icon: 'list-tree', source: 'Core' },
	'all-properties': { displayName: 'All properties', icon: 'database', source: 'Core' },
	graph: { displayName: 'Graph view', icon: 'git-fork', source: 'Core' },
	localgraph: { displayName: 'Local graph', icon: 'git-fork', source: 'Core' },
};

export function deriveCandidateViewTypes(
	registeredTypes: string[],
	fileBackedTypes: string[],
): string[] {
	const fileBacked = new Set(fileBackedTypes);
	return [...new Set(registeredTypes)]
		.filter((type) => type.length > 0 && !fileBacked.has(type) && !SYSTEM_VIEW_TYPES.has(type))
		.sort((left, right) => left.localeCompare(right));
}

function normalizeIdentifier(value: string): string {
	return value.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '');
}

export function resolveCommunitySource(
	viewType: string,
	manifests: Pick<PluginManifest, 'id' | 'name'>[],
): string | undefined {
	const normalizedType = normalizeIdentifier(viewType);
	if (normalizedType.length < 4) {
		return undefined;
	}
	let bestMatch: Pick<PluginManifest, 'id' | 'name'> | undefined;
	let bestLength = 0;

	for (const manifest of manifests) {
		const normalizedId = normalizeIdentifier(manifest.id);
		if (normalizedId.length < 4) {
			continue;
		}
		if (
			(normalizedType.includes(normalizedId) || normalizedId.includes(normalizedType)) &&
			normalizedId.length > bestLength
		) {
			bestMatch = manifest;
			bestLength = normalizedId.length;
		}
	}

	return bestMatch?.name;
}

function safeViewMetadata(leaf: WorkspaceLeaf | undefined): KnownViewMetadata {
	if (!leaf) {
		return {};
	}

	let displayName: string | undefined;
	let icon: string | undefined;
	try {
		displayName = leaf.view.getDisplayText().trim() || undefined;
	} catch {
		displayName = undefined;
	}
	try {
		icon = leaf.view.getIcon().trim() || undefined;
	} catch {
		icon = undefined;
	}
	return { displayName, icon };
}

export class ViewInventory {
	constructor(private readonly app: App) {}

	snapshot(knownViews: Record<string, KnownViewMetadata>): ViewInventorySnapshot {
		const leavesByType = new Map<string, WorkspaceLeaf[]>();
		this.app.workspace.iterateAllLeaves((leaf) => {
			const type = leaf.view.getViewType();
			const leaves = leavesByType.get(type) ?? [];
			leaves.push(leaf);
			leavesByType.set(type, leaves);
		});

		const registry = getViewRegistry(this.app);
		const registeredTypes = registry?.viewByType ? Object.keys(registry.viewByType) : [];
		const fileBackedTypes = registry?.typeByExtension ? Object.values(registry.typeByExtension) : [];
		const hasRegistry = registeredTypes.length > 0;
		const candidateTypes = hasRegistry
			? deriveCandidateViewTypes(registeredTypes, fileBackedTypes)
			: [...new Set([...leavesByType.keys(), ...Object.keys(knownViews)])].filter(
					(type) => !SYSTEM_VIEW_TYPES.has(type),
				);

		const manifests = getEnabledCommunityManifests(this.app);
		const views = candidateTypes.map((type) => {
			const leaves = leavesByType.get(type) ?? [];
			const current = safeViewMetadata(leaves[0]);
			const core = CORE_VIEW_METADATA[type] ?? {};
			const remembered = knownViews[type] ?? {};
			const placement = summarizeLeafPlacement(leaves);
			return {
				type,
				displayName: current.displayName ?? remembered.displayName ?? core.displayName ?? type,
				icon: current.icon ?? remembered.icon ?? core.icon ?? 'panel-right',
				source:
					core.source ?? resolveCommunitySource(type, manifests) ?? remembered.source ?? 'Unknown source',
				currentPlacement: placement.placement,
				hasDuplicates: placement.hasDuplicates,
			};
		});

		views.sort((left, right) => left.displayName.localeCompare(right.displayName));
		return { mode: hasRegistry ? 'registry' : 'fallback', views };
	}
}
