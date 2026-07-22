import { Notice, Plugin } from 'obsidian';
import { openPluginSettings } from './compatibility';
import {
	normalizeSettings,
	type Placement,
	type SidebarViewManagerSettings,
} from './model';
import { SidebarViewManagerSettingTab } from './settings-tab';
import { ViewInventory, type ViewDescriptor, type ViewInventorySnapshot } from './view-inventory';
import { ViewReconciler } from './view-reconciler';

export default class SidebarViewManagerPlugin extends Plugin {
	private pluginData!: SidebarViewManagerSettings;
	private inventory!: ViewInventory;
	private reconciler!: ViewReconciler;

	async onload(): Promise<void> {
		this.pluginData = normalizeSettings(await this.loadData());
		this.inventory = new ViewInventory(this.app);
		this.reconciler = new ViewReconciler(this.app.workspace);

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

		this.app.workspace.onLayoutReady(() => {
			window.setTimeout(() => {
				void this.applyStartupPreferences();
			}, 250);
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
