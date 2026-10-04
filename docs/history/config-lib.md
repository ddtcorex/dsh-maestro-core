<!-- Archived changelog of the absorbed `@ddtcorex/dsh-maestro-config-lib` repository.
     It ships as the dsh-maestro-core history record, not as a separate package. -->

# Changelog

## [0.3.0] - 2026-09-22

### Added

- `unset(domain, key)` — the store could only merge, never delete. Deletes
  one top-level key (dots rejected), validates the resulting domain like
  `set()`, writes atomically and reports whether anything was deleted (#31).

### Removed

- Obsolete one-shot legacy/notify in-store migrations — they never fire
  again on a live store; flat-key adapters stay (#31).

### Tests

- Pin the `telegramReviewNotifications` two-hop legacy alias mapping with
  regression tests (DOMAIN_KEY_MAP entry, splitLegacyPatch routing,
  readFlat/writeLegacyPatch round-trip) (#30).

## [0.2.0] - 2026-09-13

### Added

- Map `pinSessionTtlHours` into `domains.tunnel` so the PIN session lifetime
  is configurable through the shared settings doc (#26).

### Changed

- Settings store lives under `dsh-maestro-config` (#25).

## [0.1.7] - 2026-09-08

### Fixed

- **`load()` sees out-of-band store edits** — the memoized settings doc is
  now keyed by file mtime: one stat per `load()`, re-read on drift, so
  edits made by other processes surface without a host restart. Fail-open
  on stat errors (serves the memoized doc, boot never breaks) (#23).

## [0.1.6] - 2026-09-04

### Added

- Flat key `autoReviewOnAssign` → `gitlab.autoReviewOnAssign` for the
  review plugin's global assign-trigger flag (review #70 / config #39).

## [0.1.5] - 2026-09-03

### Removed

- Drop dead `supervisorModel` → `supervisor.model` mapping, the `supervisor`
  domain validator registration and the `supervisorValidator` export —
  the supervisor runs a deterministic debug-agent without LLM, so nothing
  reads this key anymore.

## [0.1.4] - 2026-09-02

### Added

- Map `lanPort`/`lanHost`/`lanPinEnabled` tunnel settings into `domains.tunnel` (local-PIN-gate, 2026-09-02).

All notable changes to this project are documented in this file. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-08-28

### Added

- **`supervisorModel` domain mapping** (`supervisor.model`) — persist the
  supervisor's LLM selection independently of `review.model` so standalone
  supervisor installs can use the same `provider/model/reasoningEffort` picker
  pattern without coupling to review's RPC. `DOMAIN_KEY_MAP` now covers the
  full `MaestroUserConfig` surface via `splitLegacyPatch`/`writeLegacyPatch`/
  `readFlat` adapter helpers.

## [0.1.0] - 2026-08-25

Initial release of `@ddtcorex/dsh-maestro-config-lib` — atomic namespaced JSON
store shared by every `dsh-maestro-*` plugin (`~/.dsh/maestro/settings.json`,
chmod 600). Embedded dependency with no Cordis surface so any subset of plugins
works standalone.

### Added

- **Store I/O** — exclusive-lock writers, deep-merge patches, memoized `load()`
  with instance-local `onChange` callbacks; versioned format (`version: 1`);
  unknown domains/keys survive round-trips.
- **Schema validation** — `defineDomain(name, validator)` registers a domain;
  writes are validated only for defined domains; foreign domains are never
  validated.
- **One-shot legacy migration** (`migrateLegacyIfPresent`) — first `load()` with
  no modern store transforms legacy per-package `config.json` sources into the
  single namespaced store (later sources override earlier, unknown keys land in
  `_legacy`, `lastTunnelRunning` dropped as runtime state). Consumed sources
  snapshotted to `.maestro-migrated.bak` (copy, never rename); corrupt sources
  are skipped untouched. Memoized doc is invalidated after migration.
- **Adapter helpers** — single-source `DOMAIN_KEY_MAP` plus
  `splitLegacyPatch`/`writeLegacyPatch`/`readFlat`; `RUNTIME_KEYS` documents
  machine state that adapters persist in their own sidecars.
- **Test suite** — `tests/{store,schema,migration,adapter}.spec.ts` (24 tests).

[0.1.0]: https://github.com/ddtcorex/dsh-maestro-config-lib/releases/tag/v0.1.0
[0.1.1]: https://github.com/ddtcorex/dsh-maestro-config-lib/releases/tag/v0.1.1
