import { Notice, Plugin } from 'obsidian';
import { openPluginSettings } from './compatibility';
import {
	normalizeSettings,
	type Placement,
	type SidebarSide,
	type SidebarViewManagerSettings,
} from './model';
import { SidebarViewManagerSettingTab } from './settings-tab';
import { ViewInventory, type ViewDescriptor, type ViewInventorySnapshot } from './view-inventory';
import { ViewReconciler } from './view-reconciler';
import {
	WeeklyNoteSlotController,
	type WeeklyNoteSlotStatus,
} from './weekly-note-slot';

export default class SidebarViewManagerPlugin extends Plugin {
	private pluginData!: SidebarViewManagerSettings;
	private inventory!: ViewInventory;
	private reconciler!: ViewReconciler;
	private weeklyNoteSlot!: WeeklyNoteSlotController;

	async onload(): Promise<void> {
		this.pluginData = normalizeSettings(await this.loadData());
		this.inventory = new ViewInventory(this.app);
		this.reconciler = new ViewReconciler(this.app.workspace);
		this.weeklyNoteSlot = new WeeklyNoteSlotController(
			this.app,
			this.pluginData.weeklyNote,
			async () => {
				await this.saveData(this.pluginData);
			},
		);
		this.weeklyNoteSlot.startDailyTimer();
		this.register(() => {
			this.weeklyNoteSlot.dispose();
		});

		this.addSettingTab(new SidebarViewManagerSettingTab(this.app, this));
		this.addCommand({
			id: 'open-manager',
			name: 'Open manager',
			callback: () => {
				if (!openPluginSettings(this.app, this.manifest.id)) {
					new Notice('Open settings → sidebar view manager to manage sidebar views.');
				}
			},
		});
		this.addCommand({
			id: 'restore-current-weekly-note',
			name: 'Restore current weekly note in sidebar',
			callback: () => {
				void this.runWeeklyNoteAction(() => this.weeklyNoteSlot.restoreNow());
			},
		});

		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.weeklyNoteSlot.handleLayoutChange();
			}),
		);
		this.registerDomEvent(window, 'focus', () => {
			void this.runWeeklyNoteAction(() => this.weeklyNoteSlot.checkForNewDay(), false);
		});
		this.registerDomEvent(document, 'visibilitychange', () => {
			if (document.visibilityState === 'visible') {
				void this.runWeeklyNoteAction(() => this.weeklyNoteSlot.checkForNewDay(), false);
			}
		});

		this.app.workspace.onLayoutReady(() => {
			this.registerInterval(
				window.setTimeout(() => {
					void this.initializeWorkspace();
				}, 250),
			);
		});
	}

	getInventorySnapshot(): ViewInventorySnapshot {
		return this.inventory.snapshot(this.pluginData.knownViews);
	}

	isConfigured(viewType: string): boolean {
		return this.pluginData.preferences[viewType] !== undefined;
	}

	getEffectivePlacement(view: ViewDescriptor): Placement {
		return this.pluginData.preferences[view.type]?.placement ?? view.currentPlacement;
	}

	async setPlacement(view: ViewDescriptor, placement: Placement): Promise<void> {
		await this.reconciler.apply(view.type, placement);
		this.pluginData.preferences[view.type] = { placement };
		this.pluginData.knownViews[view.type] = {
			displayName: view.displayName,
			icon: view.icon,
			source: view.source,
		};
		await this.saveData(this.pluginData);
	}

	getWeeklyNoteStatus(): WeeklyNoteSlotStatus {
		return this.weeklyNoteSlot.getStatus();
	}

	async setWeeklyNoteEnabled(enabled: boolean): Promise<void> {
		await this.weeklyNoteSlot.setEnabled(enabled);
	}

	async setWeeklyNoteSide(side: SidebarSide): Promise<void> {
		await this.weeklyNoteSlot.setSide(side);
	}

	async restoreWeeklyNoteNow(): Promise<void> {
		await this.weeklyNoteSlot.restoreNow();
	}

	private async initializeWorkspace(): Promise<void> {
		await this.applyStartupPreferences();
		await this.runWeeklyNoteAction(() => this.weeklyNoteSlot.startup());
	}

	private async runWeeklyNoteAction(
		action: () => Promise<void>,
		showError = true,
	): Promise<void> {
		try {
			await action();
		} catch (error) {
			if (!showError) {
				console.error('Sidebar View Manager weekly note check failed.', error);
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Current weekly note: ${message}`, 7000);
		}
	}

	private async applyStartupPreferences(): Promise<void> {
		const failures: string[] = [];
		for (const [viewType, preference] of Object.entries(this.pluginData.preferences)) {
			try {
				await this.reconciler.apply(viewType, preference.placement);
			} catch {
				failures.push(viewType);
			}
		}

		if (failures.length > 0) {
			new Notice(
				`Sidebar View Manager could not apply ${failures.length} saved ${
					failures.length === 1 ? 'view' : 'views'
				}. Open its settings for details.`,
				7000,
			);
		}
	}
}
