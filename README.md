# Sidebar View Manager

Sidebar View Manager gives Obsidian a single list for discovering and placing registered plugin views.

## Features

- Lists non-file views registered by enabled core and community plugins.
- Places each view in the left sidebar, right sidebar, or hides its sidebar instances.
- Searches by friendly name, technical view type, or detected plugin source.
- Remembers explicit choices and applies them once after the workspace is ready.
- Preserves main-area and popout instances when hiding a sidebar view.
- Falls back to observed and remembered views when Obsidian's internal registry is unavailable.

## Usage

1. Open **Settings → Sidebar View Manager**.
2. Search for a view.
3. Select **Left**, **Right**, or **Hidden**.

You can also run **Sidebar View Manager: Open manager** from the command palette.

An unconfigured view reflects its current sidebar position. Only choices you explicitly make are restored on startup.

## Compatibility note

Obsidian's public API can open and manage workspace leaves but cannot enumerate all registered view types. This plugin reads the internal view registry through a guarded, read-only compatibility adapter. If that internal shape changes, the manager remains usable in fallback mode with a smaller inventory.

The plugin never edits `workspace.json` directly and does not read note content or access the network.

## Current limitations

- Desktop only.
- View ordering and grouping are not managed.
- Plugin source detection is best-effort because Obsidian does not expose ownership metadata for registered community views.
- Some third-party views require plugin-specific state and may refuse to open generically. Failed moves leave existing sidebar tabs untouched.
- Hidden preferences are applied once at startup; views manually opened later in the session remain open.

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

