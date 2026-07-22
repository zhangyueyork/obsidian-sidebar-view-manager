import {
	ButtonComponent,
	Notice,
	PluginSettingTab,
	SearchComponent,
	Setting,
	setIcon,
	type App,
	type SettingDefinitionItem,
} from 'obsidian';
import type SidebarViewManagerPlugin from './main';
import { PLACEMENTS, type Placement } from './model';
import type { ViewDescriptor } from './view-inventory';

const PLACEMENT_LABELS: Record<Placement, string> = {
	left: 'Left',
	right: 'Right',
	hidden: 'Hidden',
};

export class SidebarViewManagerSettingTab extends PluginSettingTab {
	private query = '';
	private readonly busyViewTypes = new Set<string>();

	constructor(app: App, private readonly manager: SidebarViewManagerPlugin) {
		super(app, manager);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Manage sidebar views',
				desc: 'Search registered views and place them in the left sidebar, right sidebar, or keep them hidden.',
				aliases: ['view placement', 'left sidebar', 'right sidebar'],
				render: (setting) => {
					this.renderManager(setting.settingEl);
				},
			},
		];
	}

	display(): void {
		this.renderManager(this.containerEl);
	}

	private renderManager(containerEl: HTMLElement): void {
		containerEl.empty();
		containerEl.addClass('sidebar-view-manager-settings');

		const header = containerEl.createDiv({ cls: 'svm-header' });
		const eyebrow = header.createDiv({ cls: 'svm-eyebrow', text: 'WORKSPACE CONTROL' });
		eyebrow.setAttribute('aria-hidden', 'true');
		new Setting(header).setName('Place sidebar views').setHeading();
		header.createEl('p', {
			text: 'Choose where registered views live without hunting through plugin commands.',
			cls: 'svm-subtitle',
		});

		const snapshot = this.manager.getInventorySnapshot();
		const configuredCount = snapshot.views.filter((view) => this.manager.isConfigured(view.type)).length;
		this.renderSummary(containerEl, snapshot.views.length, configuredCount, snapshot.mode);

		const toolbar = containerEl.createDiv({ cls: 'svm-toolbar' });
		const searchHost = toolbar.createDiv({ cls: 'svm-search' });
		new SearchComponent(searchHost)
			.setPlaceholder('Filter by view, type, or source…')
			.setValue(this.query)
			.onChange((value) => {
				this.query = value;
				this.renderRows(list, snapshot.views);
			});

		new ButtonComponent(toolbar)
			.setIcon('refresh-cw')
			.setTooltip('Refresh registered views')
			.onClick(() => this.refresh());

		if (snapshot.mode === 'fallback') {
			const warning = containerEl.createDiv({ cls: 'svm-compatibility-warning' });
			setIcon(warning.createSpan({ cls: 'svm-warning-icon' }), 'triangle-alert');
			warning.createSpan({
				text: 'Obsidian’s internal view registry was unavailable. Showing observed and remembered views only.',
			});
		}

		const list = containerEl.createDiv({ cls: 'svm-view-list' });
		this.renderRows(list, snapshot.views);
	}

	private refresh(): void {
		const declarativeUpdate = (this as unknown as { update?: () => void }).update;
		if (typeof declarativeUpdate === 'function') {
			declarativeUpdate.call(this);
			return;
		}
		const legacyDisplay = (this as unknown as { display?: () => void }).display;
		legacyDisplay?.call(this);
	}

	private renderSummary(
		container: HTMLElement,
		totalCount: number,
		configuredCount: number,
		mode: 'registry' | 'fallback',
	): void {
		const summary = container.createDiv({ cls: 'svm-summary' });
		const total = summary.createDiv({ cls: 'svm-metric' });
		total.createEl('strong', { text: String(totalCount) });
		total.createSpan({ text: 'available views' });

		const configured = summary.createDiv({ cls: 'svm-metric' });
		configured.createEl('strong', { text: String(configuredCount) });
		configured.createSpan({ text: 'saved choices' });

		const modeMetric = summary.createDiv({ cls: 'svm-metric svm-mode-metric' });
		modeMetric.createSpan({ cls: `svm-status-dot is-${mode}` });
		modeMetric.createSpan({ text: mode === 'registry' ? 'complete registry' : 'fallback inventory' });
	}

	private renderRows(list: HTMLElement, views: ViewDescriptor[]): void {
		list.empty();
		const query = this.query.trim().toLocaleLowerCase();
		const filtered = views.filter((view) => {
			if (!query) {
				return true;
			}
			return [view.displayName, view.type, view.source].some((value) =>
				value.toLocaleLowerCase().includes(query),
			);
		});

		if (filtered.length === 0) {
			const empty = list.createDiv({ cls: 'svm-empty' });
			setIcon(empty.createSpan(), 'search-x');
			empty.createEl('strong', { text: 'No matching views' });
			empty.createSpan({ text: 'Try a plugin name or technical view type.' });
			return;
		}

		for (const view of filtered) {
			this.renderViewRow(list, view);
		}
	}

	private renderViewRow(list: HTMLElement, view: ViewDescriptor): void {
		const row = list.createDiv({ cls: 'svm-view-row' });
		if (this.busyViewTypes.has(view.type)) {
			row.addClass('is-busy');
		}

		const icon = row.createDiv({ cls: 'svm-view-icon' });
		try {
			setIcon(icon, view.icon);
		} catch {
			setIcon(icon, 'panel-right');
		}

		const identity = row.createDiv({ cls: 'svm-view-identity' });
		const titleLine = identity.createDiv({ cls: 'svm-title-line' });
		titleLine.createEl('strong', { text: view.displayName });
		if (view.hasDuplicates) {
			titleLine.createSpan({ cls: 'svm-duplicate-badge', text: 'multiple' });
		}
		const metadata = identity.createDiv({ cls: 'svm-view-metadata' });
		metadata.createSpan({ text: view.type, cls: 'svm-view-type' });
		metadata.createSpan({ text: view.source });

		const selected = this.manager.getEffectivePlacement(view);
		const control = row.createDiv({ cls: 'svm-placement-control' });
		control.setAttribute('role', 'group');
		control.setAttribute('aria-label', `Placement for ${view.displayName}`);
		for (const placement of PLACEMENTS) {
			const button = control.createEl('button', {
				text: PLACEMENT_LABELS[placement],
				cls: 'svm-placement-button',
				attr: {
					type: 'button',
					'aria-pressed': selected === placement ? 'true' : 'false',
				},
			});
			button.disabled = this.busyViewTypes.has(view.type);
			button.addEventListener('click', () => {
				void this.changePlacement(view, placement);
			});
		}
	}

	private async changePlacement(view: ViewDescriptor, placement: Placement): Promise<void> {
		if (this.busyViewTypes.has(view.type)) {
			return;
		}

		this.busyViewTypes.add(view.type);
		this.refresh();
		try {
			await this.manager.setPlacement(view, placement);
			new Notice(`${view.displayName} → ${PLACEMENT_LABELS[placement]}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Could not place ${view.displayName}: ${message}`, 7000);
		} finally {
			this.busyViewTypes.delete(view.type);
			this.refresh();
		}
	}
}
