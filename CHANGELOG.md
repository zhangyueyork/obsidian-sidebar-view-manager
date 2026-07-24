# Changelog

## Unreleased

### Features

- Add one optional Calendar-driven current-weekly-note slot for either sidebar.
- Run a single local-day/week comparison instead of continuous polling.
- Respect Calendar's missing-note confirmation, template, folder, format, and creation behavior.
- Restore a manually closed weekly-note slot on demand or at the next startup.

### Reliability

- Observe only Calendar's expected weekly-note path and expire command listeners automatically.
- Reuse the same native Markdown leaf and roll back failed sidebar opens.

## 0.1.0 - 2026-07-22

### Features

- Discover registered non-file views from enabled core and community plugins.
- Place views in the left sidebar, right sidebar, or hide their sidebar instances from one searchable settings list.
- Preserve explicit choices across restarts with guarded registry fallback and rollback-safe moves.
- Provide a theme-aware, accessible settings interface and a command-palette entry.

### Documentation

- Document architecture, compatibility boundaries, installation, usage, limitations, and the test strategy.
