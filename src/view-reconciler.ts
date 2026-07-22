import type { ViewState, Workspace, WorkspaceLeaf } from 'obsidian';
import type { Placement } from './model';
import { locateSidebarLeaf, type SidebarSide } from './sidebar-locator';

export interface ReconcileResult {
	placement: Placement;
	closedLeaves: number;
}

function sideLeaves(leaves: WorkspaceLeaf[]): WorkspaceLeaf[] {
	return leaves.filter((leaf) => locateSidebarLeaf(leaf) !== null);
}

function stateForView(viewType: string, leaves: WorkspaceLeaf[]): ViewState {
	const source = sideLeaves(leaves)[0] ?? leaves[0];
	if (!source) {
		return { type: viewType, active: true, state: {} };
	}
	const state = source.getViewState();
	return { ...state, type: viewType, active: true };
}

export class ViewReconciler {
	constructor(private readonly workspace: Workspace) {}

	async apply(viewType: string, placement: Placement): Promise<ReconcileResult> {
		const allLeaves = this.workspace.getLeavesOfType(viewType);
		const managedLeaves = sideLeaves(allLeaves);

		if (placement === 'hidden') {
			for (const leaf of managedLeaves) {
				leaf.detach();
			}
			return { placement, closedLeaves: managedLeaves.length };
		}

		const existingTarget = managedLeaves.find((leaf) => locateSidebarLeaf(leaf) === placement);
		if (existingTarget) {
			let closedLeaves = 0;
			for (const leaf of managedLeaves) {
				if (leaf !== existingTarget) {
					leaf.detach();
					closedLeaves += 1;
				}
			}
			await this.workspace.revealLeaf(existingTarget);
			return { placement, closedLeaves };
		}

		const viewState = stateForView(viewType, allLeaves);
		const target = this.createTargetLeaf(placement);
		if (!target) {
			throw new Error(`Obsidian could not create a ${placement} sidebar tab.`);
		}

		try {
			await target.setViewState(viewState);
			const openedType = target.getViewState().type;
			if (openedType !== viewType) {
				throw new Error(`The view opened as “${openedType}” instead of “${viewType}”.`);
			}
		} catch (error) {
			target.detach();
			throw error;
		}

		let closedLeaves = 0;
		for (const leaf of managedLeaves) {
			if (leaf !== target) {
				leaf.detach();
				closedLeaves += 1;
			}
		}
		await this.workspace.revealLeaf(target);
		return { placement, closedLeaves };
	}

	private createTargetLeaf(side: SidebarSide): WorkspaceLeaf | null {
		return side === 'left' ? this.workspace.getLeftLeaf(false) : this.workspace.getRightLeaf(false);
	}
}
