# Sidebar View Manager

Sidebar View Manager gives Obsidian a single list for discovering and placing registered plugin views.

## Features

- Lists non-file views registered by enabled core and community plugins.
- Places each view in the left sidebar, right sidebar, or hides its sidebar instances.
- Searches by friendly name, technical view type, or detected plugin source.
- Remembers explicit choices and applies them once after the workspace is ready.
- Preserves main-area and popout instances when hiding a sidebar view.
- Falls back to observed and remembered views when Obsidian's internal registry is unavailable.
- Keeps Calendar's current weekly note in one native Markdown sidebar tab.
- Checks the week once per local day and lets Calendar handle missing-note prompts, templates, and creation.

## Usage

1. Open **Settings → Sidebar View Manager**.
2. Search for a view.
3. Select **Left**, **Right**, or **Hidden**.

You can also run **Sidebar View Manager: Open manager** from the command palette.

An unconfigured view reflects its current sidebar position. Only choices you explicitly make are restored on startup.

### Current weekly note

1. Install and enable the Calendar community plugin, then configure its weekly notes.
2. Open **Settings → Sidebar View Manager**.
3. Enable **Keep current weekly note in sidebar** and select the left or right sidebar.

The feature restores the saved weekly note on startup. Once per local day it compares the current calendar week; when the week changes, it runs Calendar’s **Open weekly note** command. Calendar prompts before creating a missing note according to its own setting. After Calendar opens the note, Sidebar View Manager places it in the dedicated sidebar tab and restores the previous editor tab when it can do so safely.

Closing the dedicated tab keeps it closed for the rest of the session. Use **Restore now** or the **Sidebar View Manager: Restore current weekly note in sidebar** command to reopen it.

To keep the weekly note in a specific upper or lower sidebar region, drag its dedicated tab to that region once. Future weekly-note replacements, including the first replacement after an Obsidian restart, reuse that exact tab instead of creating another sidebar region.

## Compatibility note

Obsidian's public API can open and manage workspace leaves but cannot enumerate all registered view types. This plugin reads the internal view registry through a guarded, read-only compatibility adapter. If that internal shape changes, the manager remains usable in fallback mode with a smaller inventory.

The Calendar integration uses Calendar's registered command and guarded configuration metadata to identify the expected weekly-note path. Calendar remains responsible for reading templates and creating files. Sidebar View Manager never edits `workspace.json` directly, reads note content, or accesses the network.

## Current limitations

- Desktop only.
- View ordering and grouping are not managed.
- Plugin source detection is best-effort because Obsidian does not expose ownership metadata for registered community views.
- Some third-party views require plugin-specific state and may refuse to open generically. Failed moves leave existing sidebar tabs untouched.
- Hidden preferences are applied once at startup; views manually opened later in the session remain open.
- The current-week slot requires the Calendar plugin and its `calendar:open-weekly-note` command.
- Calendar briefly opens the weekly note using its normal unpinned-leaf behavior. The original editor tab is restored when it is still the same leaf captured before the command.
- If the Calendar creation prompt is canceled, the plugin waits until the next local day or an explicit **Restore now** action before asking again.

## Development

```bash
npm install
npm run check
```

Build output is written to `main.js`. For manual installation copy these files to:

```text
<vault>/.obsidian/plugins/sidebar-view-manager/
```

- `main.js`
- `manifest.json`
- `styles.css`

See [DESIGN.md](DESIGN.md) for architecture and the decision log.

## License

MIT
