import type { App, EventRef, PluginManifest, ViewCreator } from 'obsidian';

export interface ViewRegistryLike {
	viewByType?: Record<string, ViewCreator>;
	typeByExtension?: Record<string, string>;
	on?: (name: 'view-registered', callback: (type: string) => void) => EventRef;
}

interface CommunityPluginsLike {
	enabledPlugins?: Set<string>;
	manifests?: Record<string, PluginManifest>;
}

interface SettingsControllerLike {
	open?: () => void;
	openTabById?: (id: string) => void;
}

interface AppInternals {
	viewRegistry?: ViewRegistryLike;
	plugins?: CommunityPluginsLike;
	setting?: SettingsControllerLike;
}

function internals(app: App): AppInternals {
	return app as App & AppInternals;
}

export function getViewRegistry(app: App): ViewRegistryLike | null {
	const registry = internals(app).viewRegistry;
	if (!registry || typeof registry !== 'object') {
		return null;
	}
	return registry;
}

export function getEnabledCommunityManifests(app: App): PluginManifest[] {
	const plugins = internals(app).plugins;
	if (!plugins?.enabledPlugins || !plugins.manifests) {
		return [];
	}

	const manifests: PluginManifest[] = [];
	for (const id of plugins.enabledPlugins) {
		const manifest = plugins.manifests[id];
		if (manifest) {
			manifests.push(manifest);
		}
	}
	return manifests;
}

export function openPluginSettings(app: App, pluginId: string): boolean {
	const setting = internals(app).setting;
	if (!setting?.open || !setting.openTabById) {
		return false;
	}
	setting.open();
	setting.openTabById(pluginId);
	return true;
}

