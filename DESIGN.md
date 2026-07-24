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

## Current weekly note slot extension

### Understanding summary

- Extend Sidebar View Manager with one optional dynamic slot for the current weekly note.
- Keep the note in a native Markdown leaf in the selected left or right sidebar.
- Use Calendar's `calendar:open-weekly-note` command as the authority for finding, prompting for, and creating a missing weekly note.
- Reuse the same sidebar leaf after the first placement; exact tab ordering remains user-controlled.
- Compare the calendar week at most once per local day, with no minute polling or vault scan.
- Respect a manual leaf close for the rest of the session and restore the slot on the next startup.
- Do not add multiple dynamic-document rules, mobile support, or exact sidebar tab ordering in this release.

### Assumptions and non-functional requirements

- Calendar is installed, enabled, and has weekly notes enabled. Otherwise the feature remains inactive and explains why in settings.
- The Calendar command ID and its weekly-note behavior are compatibility boundaries and must be guarded.
- All data stays in the vault. The feature does not use the network and does not edit Calendar settings.
- Only one daily date/week-key comparison is performed. Calendar and filesystem work happen only on initial setup, startup restoration, or a detected week change.
- Calendar remains responsible for its own confirmation dialog, filename, folder, template, and file creation.
- Existing files are never overwritten by Sidebar View Manager.
- A failed command, canceled creation, or failed sidebar update must leave the user's existing workspace usable.

### Selected design

`CalendarWeeklyNoteCommandAdapter` validates Calendar availability, reads enough guarded configuration to compute the expected current-week path, and executes `calendar:open-weekly-note`. It never creates the note itself.

`WeeklyNoteSlotController` owns one native Markdown sidebar leaf. It remembers the selected side, last weekly-note path, and last resolved week key. On startup it restores an existing saved path directly. If the week changed or no saved path exists, it asks the command adapter to run Calendar.

Before invoking Calendar, the controller captures the active leaf and view state and registers a short-lived listener for the expected weekly-note file. Calendar may briefly open that file in its normal unpinned leaf. Once observed, the controller opens the same file in the dedicated sidebar leaf, restores the captured source view when safe, and restores the previous active leaf. A canceled Calendar prompt produces no matching file-open event and therefore no workspace mutation by the controller.

`DailyWeekCheck` records the last local date checked. It runs after layout readiness, on window focus or visibility restoration, and with one timeout scheduled for the next local day. It compares only the current week key. Calendar is invoked only when that key differs from the resolved key. A layout change that removes the owned sidebar leaf marks the slot closed for the current session.

The settings page adds an enable toggle, left/right selection, compatibility/status text, and a **Restore now** action that clears the session-close state and runs reconciliation immediately.

### Error handling and edge cases

- Missing Calendar, a missing command, or invalid weekly-note configuration disables reconciliation without touching leaves.
- The Calendar listener matches only the computed weekly-note path and expires, preventing unrelated file opens from being adopted.
- Concurrent startup, focus, and daily checks share one in-flight reconciliation.
- A failed target open leaves the existing sidebar and source leaves intact.
- Source view restoration is attempted only when Calendar actually replaced that leaf.
- Canceling Calendar's creation prompt causes no retry until the next local day or an explicit **Restore now** action.
- Calendar configuration changes are picked up on the next daily or manual check.

### Testing strategy

- Unit-test daily gating, week transitions, first-run behavior, canceled/expired command observation, and concurrent check coalescing.
- Unit-test Calendar availability and configuration guards plus exact expected-path matching.
- Unit-test sidebar leaf reuse, session-close behavior, source restoration, side changes, and rollback.
- Run ESLint, Vitest, TypeScript checking, and a production bundle.
- Manually test an existing weekly note, Calendar's missing-note prompt, prompt cancellation, template-based creation, startup restoration, a simulated week change, both sidebars, and closing the slot.

### Extension decision log

| Decision | Alternatives | Reason |
| --- | --- | --- |
| Extend Sidebar View Manager | New plugin; QuickAdd script | Reuses sidebar placement and persistence while avoiding another dependency |
| One current-week slot | Generic multiple dynamic documents | Meets the concrete need with less configuration and compatibility surface |
| Execute Calendar's command | Reimplement Calendar creation; Periodic Notes | Keeps Calendar responsible for prompting, templates, and creation |
| Daily week comparison | Minute polling; startup only | Negligible steady-state cost while still handling long-running sessions |
| Native Markdown leaf | Custom rendered item view | Preserves normal editing behavior |
| Briefly observe and relocate Calendar's opened file | Patch Calendar internals; replace workspace methods | Avoids invasive monkey-patching and keeps failure recoverable |
| Respect manual close for the session | Immediately recreate | Avoids fighting deliberate user actions |
