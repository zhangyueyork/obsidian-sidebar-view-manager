import type { WorkspaceLeaf } from 'obsidian';
import type { Placement, SidebarSide } from './model';

export type { SidebarSide } from './model';

export interface PlacementSummary {
	placement: Placement;
	hasDuplicates: boolean;
	leftCount: number;
	rightCount: number;
}

export function placementFromCounts(leftCount: number, rightCount: number): PlacementSummary {
	const placement: Placement = leftCount > 0 ? 'left' : rightCount > 0 ? 'right' : 'hidden';
	return {
		placement,
		hasDuplicates: leftCount + rightCount > 1,
		leftCount,
		rightCount,
	};
}

export function locateSidebarLeaf(leaf: WorkspaceLeaf): SidebarSide | null {
	const container = leaf.view.containerEl;
	if (container.closest('.workspace-split.mod-left-split')) {
		return 'left';
	}
	if (container.closest('.workspace-split.mod-right-split')) {
		return 'right';
	}
	return null;
}

export function summarizeLeafPlacement(leaves: WorkspaceLeaf[]): PlacementSummary {
	let leftCount = 0;
	let rightCount = 0;

	for (const leaf of leaves) {
		const side = locateSidebarLeaf(leaf);
		if (side === 'left') {
			leftCount += 1;
		} else if (side === 'right') {
			rightCount += 1;
		}
	}

	return placementFromCounts(leftCount, rightCount);
}
