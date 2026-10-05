<!-- Archived changelog of the absorbed `@ddtcorex/dsh-maestro-config` repository.
     It ships as the dsh-maestro-core history record, not as a separate package. -->

# Changelog

## [0.6.0] - 2026-09-22

### Added

- Guard tab speaks schema v2 with merged blacklist: per-rule
  Default/Allow/Journal/Ask/Deny selectors grouped by boundary, ListEditor
  rows, CommitField numbers, live status summary, Reset to defaults; the
  standalone Blacklist pill folds in as an offline-scan section (#51).
- `unset(domain, key)` endpoint on the service facade and generic RPC
  channel, backed by lib.unset — first use: deleting dead keys (#51).

### Fixed

- Sort Maestro settings tabs after archived sessions (order block starts
  at 26) (#53).
- Hold iOS settings fields at the 16px floor instead of opting out (#50).

### Changed

- Follow `@ddtcorex/dsh-maestro-config-lib` to `^0.3.0` (unset support).

## [0.5.1] - 2026-09-14

### Fixed

- **Opt the settings fields out of the iOS 16px field floor.** On touch screens
  up to 1023px wide, `dsh-maestro-mobile` holds every text field at
  `font-size: 16px !important` under `html[data-mobile-nav-ios]`, because iOS
  WebKit magnifies the visual viewport for a focused field below 16px. That
  floor also caught fields this panel never declared, so on an iPhone/iPad the
  settings fields rendered 2-3px larger than the labels and helper text beside
  them. The panel now restores plain inheritance for its own fields inside the
  same predicate, with an id-level `:not(#…)` token that out-ranks the ten
  `:not([type=…])` clauses of the floor; desktop and touch-Android are
  untouched. (#46)

## [0.5.0] - 2026-09-13

### Added

- PIN session duration control in the Tunnel settings card (#43).

### Changed

- The Tunnel section now leads with Public access (#44).

### Fixed

- Declare row `inject` for DSH 0.1.5 (#42), and stop tracking `lib/` build
  output (#41).

All notable changes to this project are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-09-04

### Added

- Review trigger toggles (global + per-project): re-review on push and
  review on reviewer assignment, with per-project rows overriding globals.
  Requires `@ddtcorex/dsh-maestro-config-lib@^0.1.6`. (#39)

### Fixed

- Make GitLab token, webhook secret and bot token editable in Settings.
  (#38)

## [0.3.1] - 2026-09-03

### Removed

- **Dead Supervisor model UI** — the Review-tab `Supervisor model` row and the
  legacy card `Supervisor LLM` section (plus their dual-write paths to
  `domains.supervisor.model`). The supervisor is deterministic without LLM,
  so the setting had no effect. The Supervisor tab
  (`intervalMs`/`downThreshold`/`autoResume`) is unchanged.

## [0.3.0] - 2026-09-02

### Added

- **Row-based mappings editor** — replace placeholder JSON editor with row-based mappings UI for better UX.

### Fixed

- **Maestro Access redesign + mobile friendly** (#33).

### Changed

- Refresh client type map for mappings editor.


## [0.1.1] - 2026-08-28

Supervisor model support on the Settings card.

### Added

- **Supervisor LLM model picker** in the Settings UI — domain `supervisor` exposes
  `supervisorModel` (e.g. `google/gemini-2.5-pro`, `anthropic/claude-4-sonnet`)
  with a model-aware `reasoningEffort` filter so only capabilities supported by
  the selected model are offered.

### Fixed

- **Reasoning effort options filtered per model capability** — `reasoningEffort`
  choices are now gated by the selected model's supported set, preventing an
  invalid effort/model combination from being persisted.
- **Config-lib dependency made publishable** — switched from `workspace:^` lock
  artifact to `^0.1.1` for releases and re-added the sibling `pnpm-workspace.yaml`
  entry so local installs still resolve the sibling; enforces `pnpm publish`
  rewriting to a real semver range.

### Changed

- CI / release unified through the reusable `ddtcorex/dsh-maestro-ci` workflows
  (`node-plugin.yml` for verify, `node-release.yml` for tag releases);
  community files and `private: false` added per public checklist.

## [0.1.0] - 2026-08-26

Initial release of `@ddtcorex/dsh-maestro-config`, the optional Cordis layer
over the shared Maestro settings store (`~/.dsh/maestro/settings.json`, chmod 600).
The embedded lib (`@ddtcorex/dsh-maestro-config-lib`) is the always-present
foundation; this plugin adds the service/RPC surface and schema-driven Settings card.

### Added

- **Service `maestroConfig`** — `listDomains()`, `get(domain)`, `set(domain, patch)`,
  `onChange(cb)` thin facade over `@ddtcorex/dsh-maestro-config-lib` (load/deep-merge
  with atomic file lock, domain validators via `defineDomain`, unknown domains/keys
  survive round-trips; `dshHome` injectable for tests).
- **Loopback RPC channel `/dsh-maestro-config`** — endpoints `list | get | set`
  registered inside `ctx.effect` with `RpcResult` `ok/fail` helpers (synthetic
  `bad-request` details mirroring harness validation).
- **Settings card (client)** — `settings.section` id `maestro-config` (legacy
  Maestro card port) data-driven over domains via RPC; registers the Maestro
  glyph in the settings nav (audio-lines icon) and ships as `lib/client.js`
  via `scripts/build-client.mjs` (tsc + esbuild DSH ModuleLoader wrapper).
- **Cordis row `maestro-config`** via `cordis.patch.yml` and `lib/` flat emit
  (`tsconfig.json` `rootDir: src/host` → `lib/index.js`, `allowBuilds.esbuild: true`).

[0.1.1]: https://github.com/ddtcorex/dsh-maestro-config/releases/tag/v0.1.1
[0.1.0]: https://github.com/ddtcorex/dsh-maestro-config/releases/tag/v0.1.0
