# Sidebar View Manager design

## Understanding summary

- Build a standalone desktop Obsidian plugin that exposes sidebar-capable registered views in one management list.
- The list lives in the plugin settings and is also reachable from the command palette.
- Each view has three placements: left sidebar, right sidebar, or hidden.
- Only views from enabled plugins are listed; disabled and uninstalled plugins are out of scope.
- Explicit preferences are applied once after the workspace is ready. The plugin does not continuously fight later user actions.
- The plugin may read the internal view registry through a guarded compatibility adapter because the public API cannot enumerate registered view types.
- The first release does not provide ordering, grouping, plugin enable/disable controls, or mobile support.

## Assumptions and non-functional requirements

- A vault has at most a few hundred registered view types; inventory and filtering should feel immediate.
- Settings are local to the vault. The plugin does not access note content or the network.
- Public workspace APIs are used for opening, restoring, and closing leaves. Internal APIs are isolated and read-only.
- A failure involving one view must not prevent other configured views from being applied.
- The compatibility adapter is the primary maintenance seam when Obsidian changes internal structures.

## Considered approaches

1. **Guarded registry inventory — selected.** Read registered view types, exclude file-backed content views, then combine the result with observed workspace metadata. This gives the most complete cold-start inventory.
2. **Command inference.** Infer views from commands named Open or Show. More public API usage, but command-to-view relationships are incomplete and unreliable.
3. **Runtime observation.** Remember only views that have appeared in the workspace. Stable, but incomplete until the user manually opens every view.

## Architecture

- `ViewInventory` reads the internal registry through structural type guards, removes extension-backed content views, and enriches entries from current leaves and remembered metadata.
- `SidebarLocator` classifies leaves using their nearest left/right sidebar workspace container. Main-area and popout leaves are deliberately ignored by placement operations.
- `ViewReconciler` captures a source `ViewState`, creates the target sidebar leaf, restores the state, verifies success, and only then detaches previous sidebar instances. Failed moves leave the source intact.
- `SidebarViewManagerSettingTab` renders search, compatibility status, counts, and an accessible three-way placement control.
- `SidebarViewManagerPlugin` owns persistence, startup reconciliation, commands, and error isolation.

## Data flow

1. The settings page asks the inventory for registered candidates.
2. Inventory metadata is merged with saved friendly names and current sidebar placement.
3. A placement click invokes the reconciler immediately.
4. The preference and observed metadata are saved only after reconciliation succeeds.
5. On startup, only explicit saved preferences are applied once after layout readiness.

## Error handling

- Missing or changed registry internals trigger fallback inventory from current and remembered views.
- A target leaf is detached if restoration fails; existing sidebar leaves remain untouched.
- Main-area and popout instances are never closed by a hidden preference.
- Startup failures are collected and reported in one notice rather than interrupting plugin loading.
- Unknown views use their technical type ID instead of being instantiated merely to discover a label.

## Testing strategy

- Unit-test settings migration, candidate filtering, source heuristics, sidebar placement, and reconciliation rollback with mocks.
- Run ESLint, Vitest, TypeScript type checking, and a production bundle.
- Manual Obsidian QA should cover core views plus at least two community plugins, movement in both directions, hidden startup state, duplicate sidebar instances, and registry fallback messaging.

## Decision log

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Settings list, not another sidebar view | Modal; main-area view | Persistent discoverability without consuming sidebar space |
| Three-state placement | Open/close only; ordering and grouping | Directly models the requested left/right/hidden behavior |
| Guarded internal registry | Commands; observation only | Only practical way to provide a complete initial list |
| Apply once at startup | Continuous enforcement; manual apply only | Preserves preferences without fighting deliberate user actions |
| Do not instantiate views for labels | Hidden probe leaves | Avoids arbitrary third-party constructor side effects |
| Affect sidebar leaves only | Detach all leaves of a type | Prevents data loss or surprising main-area changes |

