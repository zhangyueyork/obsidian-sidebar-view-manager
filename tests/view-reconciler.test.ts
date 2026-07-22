import type { ViewState, Workspace, WorkspaceLeaf } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { ViewReconciler } from '../src/view-reconciler';

function containerFor(side: 'left' | 'right' | 'main'): HTMLElement {
	return {
		closest: (selector: string) =>
			side !== 'main' && selector.includes(`mod-${side}-split`) ? ({} as Element) : null,
	} as HTMLElement;
}

function leaf(
	type: string,
	side: 'left' | 'right' | 'main',
	setViewState: (state: ViewState) => Promise<void> = async () => undefined,
): WorkspaceLeaf {
	return {
		view: {
			getViewType: () => type,
			containerEl: containerFor(side),
		},
		getViewState: () => ({ type, state: { preserved: true } }),
		setViewState: vi.fn(setViewState),
		detach: vi.fn(),
	} as unknown as WorkspaceLeaf;
}

function workspace(
	leaves: WorkspaceLeaf[],
	leftTarget: WorkspaceLeaf | null,
	rightTarget: WorkspaceLeaf | null,
): Workspace {
	return {
		getLeavesOfType: vi.fn(() => leaves),
		getLeftLeaf: vi.fn(() => leftTarget),
		getRightLeaf: vi.fn(() => rightTarget),
		revealLeaf: vi.fn(),
	} as unknown as Workspace;
}

describe('ViewReconciler', () => {
	it('hides sidebar leaves without touching main-area leaves', async () => {
		const left = leaf('outline', 'left');
		const main = leaf('outline', 'main');
		const reconciler = new ViewReconciler(workspace([left, main], null, null));

		await reconciler.apply('outline', 'hidden');

		expect(left.detach).toHaveBeenCalledOnce();
		expect(main.detach).not.toHaveBeenCalled();
	});

	it('restores state in the target before detaching the source', async () => {
		const source = leaf('outline', 'left');
		const target = leaf('outline', 'right');
		const targetSetState = vi.mocked(target.setViewState);
		const reconciler = new ViewReconciler(workspace([source], null, target));

		await reconciler.apply('outline', 'right');

		expect(targetSetState).toHaveBeenCalledWith({
			type: 'outline',
			state: { preserved: true },
			active: true,
		});
		expect(source.detach).toHaveBeenCalledOnce();
	});

	it('rolls back the target and preserves the source when restoration fails', async () => {
		const source = leaf('outline', 'left');
		const target = leaf('outline', 'right', async () => {
			throw new Error('unsupported state');
		});
		const reconciler = new ViewReconciler(workspace([source], null, target));

		await expect(reconciler.apply('outline', 'right')).rejects.toThrow('unsupported state');
		expect(target.detach).toHaveBeenCalledOnce();
		expect(source.detach).not.toHaveBeenCalled();
	});
});
