# AGENTS.md — dsh-maestro-core (published as `@ddtcorex/dsh-maestro-supervisor`)

> `CLAUDE.md` at the repo root is a symlink to `AGENTS.md`. Claude Code follows the same rule set as Codex CLI. Only edit `AGENTS.md` — never edit `CLAUDE.md` directly or replace the symlink with a copy.

## Purpose

This repository is **dsh-maestro-core**: the DSH Web resilience supervisor plus the settings store, the Maestro settings card, the tool guard and the harness-to-harness sync engine, all shipped as one package with one client bundle. It still publishes under the name `@ddtcorex/dsh-maestro-supervisor` — the repository rename and the local directory move are a later step, and an installed profile has to keep resolving in the meantime. See `## Modules`.

Supervisor for DSH Web resilience — three cooperating layers:

1. **Standalone daemon** (`dsh-web-supervisor` binary, systemd `dsh-web-supervisor.service`): runs **outside** the `pnpm → sh → node` tree so it survives tree crashes. Polls `:3080` every 3s, maintains last-known-good (LKG) snapshots, auto-rollbacks on crash, writes `report-<ts>.md`, and optionally notifies via Telegram.
2. **In-tree host plugin** (`src/host/plugin.ts`, `src/host/resume.ts`, `src/host/supervisor.ts`): runs **inside** `dsh web` (needs `sessions`/`agents`/`connection` context the daemon cannot reach). Auto-resumes sessions interrupted within the configured window (default 5 minutes) by re-attaching the agent and sending `continue`.
3. **In-tree client plugin** (`src/client/auto-reload.ts`): runs **in the browser**. Hybrid auto-reload — polls `HEAD /` when the server is down (offline/WebSocket close) and reloads as soon as `200`, plus host push via `runAutoResume` health recovery. Survives `dsh web` restarts without manual `F5`.

Names by boundary: npm package `@ddtcorex/dsh-maestro-supervisor`; binary `dsh-web-supervisor`; Cordis row `maestro-supervisor`; RPC channel `/dsh-maestro-supervisor-resume` (loopback) and `/dsh-maestro-supervisor-reload` (client). The daemon itself is **not** a Cordis plugin — standalone daemon (Phase 1 Guard & Report of `<workspace-root>/docs/specs/2026-08-27-dsh-web-resilience-design.md`). The host+client plugins are the one deliberate in-tree exception — see `## Conventions`.

Part of the Maestro Harness suite. See spec for Phase 2 (loader isolation) and Phase 3 (deterministic debug auto-fix — NO LLM — + Telegram + session resume).

### Absorbed repositories

`dsh-maestro-config-lib`, `dsh-maestro-config`, `dsh-maestro-guard` and `dsh-maestro-sync` were merged here with their history intact (`git log --follow <path>` reaches the original commits). Their changelogs are kept under `docs/history/<name>.md`, and each module's tests run from `tests/<name>/`. A core-side fix for a module belongs to this repository; do not reopen the absorbed repositories.

## Architecture

```
┌─ Host (Node, isolate) ──────────────────┐     ┌─ Client (Browser) ──────────────┐
│  daemon (systemd, outside tree)          │     │  auto-reload.ts (poll + WS)    │
│   pollHealth() ──► supervisor.tick()     │     │   offline/online/WS close →    │
│   writeLKG/verify/rotate(3)              │     │   setInterval HEAD / 1s →      │
│   rollback + restartWeb --auto           │     │   200 → location.reload()      │
│  ─────────────────────────────────────   │     │                                 │
│  plugin.ts (inside tree, 8s timer)       │◄───►│  dsh.client inject runtime      │
│   runAutoResume()                        │     │   window.__ModuleLoader__.load  │
│   ├─ findInterrupted (tail 100)          │     │                                 │
│   ├─ findDanglingOpenTurns (full scan)   │     └─────────────────────────────────┘
│   └─ resumeInterrupted → agents.resume() │
│      + followup('continue') + recover    │     Daemon ↔ Plugin: loopback RPC
│        provider/model from request/context│     POST /dsh-maestro-supervisor-resume/resume
│  RPC /dsh-maestro-supervisor-resume      │     Daemon uses resumeViaRpc()
└──────────────────────────────────────────┘
```

* **Daemon ↔ Web:** `supervisor.ts` `resumeViaRpc()` POSTs `client-request` envelope to `http://127.0.0.1:3080/dsh-maestro-supervisor-resume/resume`. Reachability is loopback because the daemon dials `127.0.0.1`, not because registration requests it: `connection.rpc.handle(channel, handler)` takes exactly two parameters and has no `authority` option (a third argument is silently ignored; loopback is reported by `connection.isLoopback`). The in-tree plugin handles it via `createResumeRpcHandler` and returns `{resumed: string[]}`. Daemon never blocks on notifier.
* **Host ↔ Client:** Client polling is primary (works when host is down); host push is secondary (after `health.up` or `runAutoResume` success, host could `emit`/`broadcast` — currently client polling alone is sufficient and host health check is the hybrid's host half).
* **Sessions:** Stored at `~/.dsh/sessions/<projectKey>/<sessionId>/` as ONE log file named by Session format generation — `session.jsonl[.zstd]` for generation 0, `session.v<N>.jsonl[.zstd]` for every later generation (currently `session.v4.jsonl.zstd` on DSH 0.1.7-rc.1; the harness names it via `generationLogFilename(version, compression)`, and generations are unbounded). Older generations stay beside it as migration artifacts. Always resolve the log through `resolveSessionLogPath()` (`src/host/session-log-file.ts`) — never by literal filename. `projectKey` is `sha1(cwd)` humanized (`--home-kai-Work-htdocs-maestro-harness--`). Subagents have `origin: subagent`, `parentSession`, same storage.

## Layout

- `src/host/index.ts` — CLI entry (`daemon|status|logs|rollback`)
- `src/host/cli.ts` — argument parsing and command dispatch
- `src/host/bin.ts` — daemon binary entry (`dsh-web-supervisor`), wires `Supervisor` and starts poll loop
- `src/host/paths.ts` — shared `~/.dsh/.supervisor/**` path helpers (LKG, failed, reports, lock, config) + `resolveSupervisorPackageDir()` (walks up from this file to the package root, so `src/host/` and the built `lib/` both resolve it)
- `src/host/daemon-freshness.ts` — in-tree supervisor-daemon freshness behind injectable probes (`mainPid`/`cmdline`/`startMs`/`newestLibMs`) → `fresh|stale|absent|unknown`, plus `describeDaemonState()`. The port of the bash helper's `supervisor_daemon_state`: `dsh_web_restart` reports the verdict at schedule time because an in-session agent can neither run the helper (self-kill guard) nor be trusted to remember the check. Read-only — it never signals the daemon.
- `src/host/supervisor.ts` — `Supervisor` class: poll loop (3s), debounce (60s), rolling guard, `resumeViaRpc()` (loopback POST), `attemptAutoResume()` with `RESUME FAILED/SKIPPED` vs `RESUME: continue triggered` notifies
- `src/host/snapshot.ts` — LKG store: `writeLKG`, `verifyLKG` (sha256), `rotateLKG(3)`, `writeFailed`; `df` >500MB guard and `manifest.json`
- `src/host/health-poller.ts` — `pollHealth()` with injectable `fetch/psAlive/logTail`; detects `ERR_MODULE_NOT_FOUND` / `assertChannel` / `unhandledRejection` / `EADDRINUSE`
- `src/host/report.ts` — `writeReport()` → `~/.dsh/.supervisor/reports/report-<ts>.md` (health + git diff + log tail 200)
- `src/host/notifier.ts` — Telegram bridge via `dsh-maestro-notifier` (swallow errors, never block rollback)
- `src/host/debug-agent.ts` — deterministic rule-based auto-fix + dry-boot transient detection (Phase 3; **NO LLM** — never calls a model), spawned on-demand only after LKG rollback (max 3 attempts, cooldown)
- `src/host/session-health.ts` — session-log health scan: re-encodes single-whole-file-frame logs to canonical multi-frame (data preserved), quarantines corrupt first frames; run as the `dsh-safe-restart` pre-flight + loopback RPC `/dsh-maestro-supervisor-session-health` (fzstd + `node:zlib.zstdCompressSync`, Node ≥22.15)
- `src/host/tool-view.ts` — tool-view observability: `probeToolView()` reports the missing critical tools, the visible count and `registry: reachable|unreachable` (an unreadable registry is NEVER evidence of health), `defaultResolveToolScope()` (the live agent, else the session id) and `summarizeToolView()`
- `src/host/preset.ts` — agent-preset composition: `resolveSessionPresetId()` (attached projection → persisted header → raw-log header), `makePresetSetup()` (the `setup` handed to `agents.resume`), `composedPresetId()` (the roster's authoritative `agentPresets.composedPreset` answer) and `repairAgentPreset()` (`agentPresets.recompose` for an agent that joined no preset)
- `src/host/resume-tools.ts` — post-delivery tool-view probe + `warnCoreToolLoss` (notify + tool-inventory system message; `resumeCoreToolPolicy: warn|park`) + `/dsh-maestro-supervisor-resume-tool-health` RPC and the `maestro_resume_tool_health` / `maestro_repair_session_preset` tools (the health render carries `registry`/`composed`/`repaired`)
- `src/host/session-log-file.ts` — the single owner of "which file is a session's log": `resolveSessionLogPath(dir)` (newest generation in that dir wins; `.zstd` over plaintext within a generation) and `sessionLogGeneration(name)`. Generations are PARSED, never listed — a literal list goes blind at every harness bump (v3 on 2026-09-11, v4 on 2026-09-23). `resume.ts`, `session-health.ts`, `plugin.ts` and `preset.ts` all resolve through it.
- `src/host/resume.ts` — `findInterrupted()` (tail 100, mtime pre-filter) and `findDanglingOpenTurns()` (full scan for recent sessions, mtime pre-filter). `parseDuration` for `5m`/`30s`/`1h`. See `## Known Issues` for why dangling needs full scan.
- `src/host/plugin.ts` — in-tree Cordis host plugin: `inject: ['sessions','agents','connection']`, `apply()` (never throws), `runAutoResume()` (merges interrupted + dangling, 5m window), `resumeInterrupted()`. Activation goes through `activateSessionAgent()` — `sessionController.resolveAgent` FIRST (the owner of agent activation the Web API uses: it composes the session's preset, de-dupes concurrent resumes, and needs no separately recovered route), then `agents.resume` with `setup: agentPresets.mount(agentCtx, presetId)`; a session that records no preset resumes bare, and a `setup` failure is wrapped in `PresetComposeError` and ABORTS that session (journal + notify + `continue`) rather than degrading into a preset-less resume. A resume blocked by another owner's write handle (the reconnecting browser re-opens the interrupted session while the boot scan runs) is retried with bounded backoff, and if the host still owns it the recovery prompt is delivered through the `sessionController.prompt` API the UI uses. Both delivery paths then `verifyResumedComposition()` — the roster answers whether the agent is joined, and a preset-less agent is repaired (`resumeAutoRepair`) BEFORE the prompt is sent — and run the tool-view probe, `createResumeRpcHandler()` (`scan`/`resume` endpoints)
- `src/client/auto-reload.ts` — in-tree Cordis client plugin: `apply()` with `ctx.effect`, `fetch HEAD /` polling on `offline`/`WebSocket close`/`visibilitychange`, `window.location.reload()` on `200`. Built via `tsc -p tsconfig.client.json && node scripts/build-client.mjs` → `lib/client.js` (`window.__ModuleLoader__.load` wrapper).
- `src/client/index.tsx` — the ONE composed client entry: `inject: ['slots','connection']` plus an `apply()` that calls `auto-reload`, `config` and `sync` in a loop, each in its own `try`/`catch` so one failing surface cannot cost the others their registration.
- `lib/` — gitignored build output. Generated; do not hand-edit, never commit. `lib/client.js` is the browser bundle, `lib/types/client/` for its d.ts (the only `declarationDir` in the build; host declarations land beside their js).
- `scripts/build-client.mjs` — esbuild bundle of `src/client/index.tsx` into the `window.__ModuleLoader__.load` wrapper (react and the DSH platform modules stay external).
- `scripts/vendor-store.mjs` — writes a consumer's embedded store copy (`<dir>/src/host/vendor/store.ts`) as one file with a `sha256` header; also exports `verifyVendored(file, sourceDir?)` for a consumer's drift test.
- `tsconfig.json` — host: `rootDir src/host → lib`, `module nodenext`. **This contract is load-bearing**: a `rootDir`/`include` that does not emit a flat `lib/index.js` bricks the plugin-tree boot before any code runs.
- `tsconfig.client.json` — client: `rootDir src/client → .client-build` (typecheck + d.ts), `jsx react-jsx`, `declarationDir lib/types/client`
- `vitest.config.ts` — `environment: node`; the three client specs opt into jsdom with a `// @vitest-environment jsdom` pragma
- `cordis.patch.yml` — four `- insert:` rows: `maestro-supervisor`, `dsh-maestro-sync`, `dsh-maestro-guard`, `maestro-config` (see `## Modules`)
- `systemd/dsh-web-supervisor.service.template` — systemd user unit (`Restart=always`, `Environment=TELEGRAM_*` commented)
- `scripts/install-systemd.sh` — installs unit to `~/.config/systemd/user/`
- `tests/*.test.ts` — vitest suites (one integration suite stays skipped unless `DSH_INTEGRATION=1`)

## Modules

One package, four host rows and one client bundle. The three absorbed repositories keep their history, their `docs/history/<name>.md` changelog and their own tests under `tests/<name>/`.

| Row id | Source | Channel | Notes |
|---|---|---|---|
| `maestro-supervisor` | `src/host/*.ts` | `/dsh-maestro-supervisor-resume` (loopback) | `name` is the package root; `config.autoResumeWithin: 5` |
| `dsh-maestro-sync` | `src/host/sync/` | `/dsh-maestro-sync` | `inject: ['tools','connection','webServer']` |
| `dsh-maestro-guard` | `src/host/guard/` | `/dsh-maestro-guard` | Channel declared by the row only; guard answers through the harness approval prompt, it registers no `rpc.handle` |
| `maestro-config` | `src/host/config/` | `/dsh-maestro-config` | `inject: ['connection','webServer']`, `config: {}` |

**Row names are subpaths.** `dsh-maestro-sync`, `dsh-maestro-guard` and `maestro-config` use `name: '@ddtcorex/dsh-maestro-supervisor/lib/<module>/index.js'`, which is why `exports["./lib/*"]` exists in the manifest: with an `exports` map present, a subpath that is not listed does not resolve, and a row whose module cannot be imported is skipped at load time. Two failure arms are silent on a normal boot, so check them deliberately with `dsh --profile web --dump-config` and grep for `name mismatch` and `entry … not found`. When the package is renamed to `dsh-maestro-core`, the three subpath names change in the same commit.

### Module: store (`src/host/store/`)

The namespaced settings document at `<DSH_HOME>/dsh-maestro-config/settings.json`, written atomically (temp file + `rename`, mode 600) under a 5s `wx` lock.

- **The store owns no domain knowledge.** It exports `defineDomain`, `definedDomains`, `load`, `get`, `set`, `unset`, `onChange`, `resetForTests` and registers **no** validator at import. A domain owner calls `defineDomain(name, validator)` from its own module — the guard validators live in `src/host/guard/validators.ts` and are imported for their side effect by the guard row. A write to an unregistered domain is accepted as-is, by design.
- `store/legacy.ts` is the flat-key adapter (`DOMAIN_KEY_MAP`, `RUNTIME_KEYS`, `splitLegacyPatch`, `writeLegacyPatch`, `readFlat`). It is a **consumer** view for plugins that still read legacy flat keys; it imports `get`/`set`/`load` from `./index.js` and is vendored together with it.
- **`onChange(cb)` fires for writes made by ANOTHER copy.** Because every plugin embeds its own copy, a listener must also hear a write that went through a different instance (or another process). While at least one listener exists the copy watches the file (`fs.watch`, debounced 50ms) and polls every 2s as a backstop; `checkExternal()` compares a JSON fingerprint per domain and fires once per changed or removed domain. `set()`/`unset()` refresh the fingerprint **before** firing their callbacks, so a local write never fires twice. The disposer is idempotent and the last one stops the watcher.
- The watcher resolves `DSH_HOME` when it starts. A store pinned to an explicit `dshHome` opts out of notification and never fires.
- `resetForTests()` stops the watcher and drops listeners.
- The store's thrown messages still carry the `config-lib:` prefix. That is a retired package name kept on purpose: consumers match on the text, and renaming a prefix that shipped is a breaking change, not a cleanup.

### Module: config (`src/host/config/`)

`maestroConfig` over the store, and the `Maestro` settings card client section (`id: maestro`, `order: 26`, tabs Guard and Supervisor). It calls only `/dsh-maestro-config` and `/dsh-maestro-supervisor-resume`. The tunnel, GitLab, review and notifier tabs moved to their owning plugins; the card helpers that had no owner left in core (PIN TTL presets, GitLab webhook secret) are parked in the workspace at `docs/plans/2026-10-05-cross-repo-regroup-wave-1-ports/` for the wave-2 port.

### Module: guard (`src/host/guard/`)

Rule classification, the approval gate and its journal. It answers through the DSH approval prompt, not through an RPC handler, so `channel: /dsh-maestro-guard` is declared by the row alone. `validators.ts` registers the `guard` and `guardBlacklist` domains with the store at module load — that import is the registration, so removing it silently disables validation for the whole package.

### Module: sync (`src/host/sync/`)

Backup, restore and retention GC over S3 or SSH, plus the `Maestro Sync` settings section (`id: maestro-sync`, `order: 28`). Every mutation is preview-first: a read-only preview produces a single-use id, and the mutation exists only in a dialog bound to that id with `confirm: true`. Its probe scripts (`scripts/sync/*.mjs`) run against a live profile, not against this package.

### Vendoring the store into another package

```bash
node scripts/vendor-store.mjs <consumer-package-dir>   # writes src/host/vendor/store.ts
```

The consumer's import becomes `./vendor/store.js` and its `config-lib` dependency goes away. A drift test calls `verifyVendored(file, <core>/src/host/store)`: the header hash catches a hand edit, the source comparison catches a copy generated from an older core store.

## Configuration

All times are **minutes** when given as `number` (e.g. `5` → 5 minutes). Strings support `30s`/`5m`/`1h` via `parseDuration`. Precedence (highest first):

1. **Cordis config** (`cordis.patch.yml` `config:` block or `apply(ctx, config)` argument) — explicit per-install, wins over everything.
2. **Env** `DSH_SUPERVISOR_AUTO_RESUME` (`1`/`true`/`yes`/`on`/`enabled` vs `0`/`false`/`no`/`off`/`disabled`), `DSH_SUPERVISOR_RESUME_WITHIN` (`5`, `5m`, `30s`, … — bare digits in env are minutes for ergonomics), `DSH_SUPERVISOR_RESUME_CORE_TOOL_POLICY` (`warn`/`park`) and `DSH_SUPERVISOR_RESUME_AUTO_REPAIR` (`1`/`true`/`yes`/`on` vs `0`/`false`/`no`/`off`).
3. **Supervisor config** `~/.dsh/.supervisor/config.json` (`autoResumeEnabled`/`autoResume`, `autoResumeWithin`/`resumeWithin` — number is minutes, string is duration).
4. **Maestro settings** `~/.dsh/maestro/settings.json` (`domains.supervisor.autoResumeEnabled`, `supervisor.autoResumeEnabled`, `domains.supervisor.autoResumeWithin`, `domains.supervisor.resumeCoreToolPolicy`, `domains.supervisor.resumeAutoRepair`, … — same types).
5. **Default:** `autoResumeEnabled: true`, `autoResumeWithin: 5` (5 minutes), `resumeCoreToolPolicy: warn`, `resumeAutoRepair: true`.

| Key | Type | Default | Env | File | Notes |
|-----|------|---------|-----|------|-------|
| `autoResumeEnabled` | `boolean` | `true` | `DSH_SUPERVISOR_AUTO_RESUME` | `config.json: autoResumeEnabled`, `settings.json: domains.supervisor.autoResumeEnabled` | `false` → notify only, no `agents.resume` |
| `autoResumeWithin` | `number` (minutes) or `string` (`5m`) | `5` | `DSH_SUPERVISOR_RESUME_WITHIN` | `config.json: autoResumeWithin`, `settings.json: domains.supervisor.autoResumeWithin` | Window for `findInterrupted`/`findDangling` mtime + event `time` filter. Bare `5` in env → 5m. |
| `resumeCoreToolPolicy` | `warn` \| `park` | `warn` | `DSH_SUPERVISOR_RESUME_CORE_TOOL_POLICY` | `config.json: resumeCoreToolPolicy`, `settings.json: domains.supervisor.resumeCoreToolPolicy` | `park` records the session as needing a manual reopen when a core tool is missing. |
| `resumeAutoRepair` | `boolean` | `true` | `DSH_SUPERVISOR_RESUME_AUTO_REPAIR` | `config.json: resumeAutoRepair`, `settings.json: domains.supervisor.resumeAutoRepair` | Before delivering the recovery prompt, re-link an agent that joined no preset (`agentPresets.recompose`). Repair mutates a live agent's tool surface and emits `tools/change`; with it off the loss is still notified and parked. |
| `notifier` | `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` | — | env | systemd `Environment=` | Loose import, never blocks rollback. |

Example `~/.dsh/.supervisor/config.json`:

```json
{
  "autoResumeWithin": 5,
  "autoResumeEnabled": true,
  "_comment": "autoResumeWithin is in MINUTES (number 5 = 5 minutes); also supports string \"5m\"/\"30s\"/\"1h\""
}
```

## Setup

### 1. Build

```sh
pnpm --dir packages/dsh-maestro-supervisor install
pnpm --dir packages/dsh-maestro-supervisor build   # tsc host + tsc client + node scripts/build-client.mjs → lib/ + lib/client.js
pnpm --dir packages/dsh-maestro-supervisor verify  # tsc --noEmit host + client
pnpm --dir packages/dsh-maestro-supervisor test    # vitest run
test -f packages/dsh-maestro-supervisor/lib/index.js
test -f packages/dsh-maestro-supervisor/lib/client.js
```

`pnpm build` is required after any `src/` change; `lib/` is gitignored, so rebuild locally after pull and before restart.

### 2. Add to DSH Web profile (host + client)

```sh
# from any shell (profile is at ~/.dsh/profiles/web)
# the package declares dsh.client automatically — no extra flag needed
dsh plugin --profile web add @ddtcorex/dsh-maestro-supervisor
# or manually: edit ~/.dsh/profiles/web/package.json
# "@ddtcorex/dsh-maestro-supervisor": "link:<workspace-root>/packages/dsh-maestro-supervisor"
# then:
pnpm --dir ~/.dsh/profiles/web install
```

Verify the link:

```sh
ls -l ~/.dsh/profiles/web/node_modules/@ddtcorex/dsh-maestro-supervisor  # → .../packages/dsh-maestro-supervisor
cat ~/.dsh/profiles/web/node_modules/@ddtcorex/dsh-maestro-supervisor/package.json | grep -A2 '"version"'
curl -s http://127.0.0.1:3080/plugins/@ddtcorex/dsh-maestro-supervisor/client.js | head -n 5  # window.__ModuleLoader__.load
```

**Critical pre-flight (AGENTS.md Conventions §2):** before adding to a live profile's `bundles`, `pnpm build` must succeed **and** a dry-boot on an ephemeral port with isolated `DSH_HOME` must pass:

```sh
DSH_HOME=$(mktemp -d) pnpm --dir deepseek-harness dsh web --port 0 &  # or --port <ephemeral>
# wait for "dsh web: http://127.0.0.1:<port>" and curl 200, then kill
# This catches load-time failures (missing lib/index.js, stale build, bad cordis.patch.yml) that no in-code try/catch can catch.
# See dsh-safe-restart skill for the guarded helper: skills/dsh-safe-restart/scripts/restart-dsh-web.sh
```

This exact failure class caused `dsh web` outages on 2026-08-27 (missing `lib/index.js`, stale `link:`). See `<workspace-root>/docs/reports/2026-08-27-dsh-web-outage-postmortem.md`.

### 3. Systemd daemon (optional, for crash detection outside the tree)

```sh
bash packages/dsh-maestro-supervisor/scripts/install-systemd.sh
systemctl --user daemon-reload
systemctl --user enable --now dsh-web-supervisor
systemctl --user status dsh-web-supervisor
journalctl --user -u dsh-web-supervisor -f
```

The template leaves `Environment=TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` commented — uncomment via `systemctl --user edit dsh-web-supervisor` if you want Telegram, otherwise it logs only.

To run without systemd (foreground, for debugging):

```sh
node packages/dsh-maestro-supervisor/lib/index.js daemon   # poll every 3s
node packages/dsh-maestro-supervisor/lib/index.js status
node packages/dsh-maestro-supervisor/lib/index.js logs --tail 50
```

### 4. Verify after install

```sh
# 1. DSH Web is up
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3080/  # 200
ss -tlnp | grep 3080  # MainThread pid

# 2. Plugin RPC is reachable (loopback only)
curl -s http://127.0.0.1:3080/dsh-maestro-supervisor-resume/scan -X POST -H 'content-type: application/json' \
  -d '{"type":"client-request","rpcId":"test","method":"scan","payload":{"withinMs":300000}}' | head -c 200
# → {"type":"server-response","rpcId":"test","result":{"ok":true,"value":{"scanned":425,"interrupted":[]}}}

# 3. Find dangling (needs full scan for subagents)
node --input-type=module -e "import {findDanglingOpenTurns} from './packages/dsh-maestro-supervisor/lib/resume.js'; console.log(await findDanglingOpenTurns(undefined,{withinMs:5*60*1000}))"

# 4. Trigger a real dangling (headless blocking sleep) and kill mid-turn, then check auto-resume:
# pnpm --dir deepseek-harness dsh --profile headless "Run bash synchronously sleep 60" & sleep 4; kill $!; sleep 10; node -e "import('./packages/dsh-maestro-supervisor/lib/resume.js').then(m=>m.findDanglingOpenTurns(undefined,{withinMs:5*60*1000}).then(console.log))"
# After restart, the session should have turn/end interrupted → continue → turn2
```

## Development

Run from the repository root (or `packages/dsh-maestro-supervisor`):

```sh
pnpm verify   # tsc --noEmit host + client
pnpm test     # vitest run
pnpm build    # tsc host + tsc client + node scripts/build-client.mjs → lib/ + lib/client.js
```

Client: `src/client/index.tsx` is the browser half (auto-reload + settings card + Sync card), typechecked via `tsconfig.client.json` (`rootDir src/client → .client-build`, d.ts to `lib/types/client/`) then esbuild-bundled by `scripts/build-client.mjs` into `lib/client.js` (`window.__ModuleLoader__.load` wrapper). Host: `src/host/*` → `lib/*.js` (flat, `rootDir src/host`).

`pnpm build` is required after any source change; `lib/` and `lib/client.js` are gitignored, so rebuild locally after pull and before restart. `test -f lib/index.js && test -f lib/client.js` after build.

CLI:

```sh
node lib/index.js --help
node lib/index.js status
node lib/index.js daemon   # poll every 3s, debounce 60s
DSH_INTEGRATION=1 pnpm test -- tests/integration.test.ts  # needs real DSH web
```

## Git workflow

- Default branch `master`. No direct commits to `master` — use `feat/<topic>` / `fix/<topic>` and a PR against `ddtcorex/dsh-maestro-supervisor`.
- Conventional commits, imperative mood (`feat:`, `fix:`, `docs:`, `chore:`). Scope without `dsh-maestro-` prefix (e.g. `fix(supervisor):`).
- One TDD task = one commit; never commit while `pnpm verify` is red.
- When the base moves, rebase the feature branch onto `origin/master`.
- `lib/` is gitignored — rebuild locally after pull and before restart, never commit build output.
- **Always request approval before merge or release:** never merge a PR/MR or publish a release (`git tag`/`pnpm publish`/`gh release`) without an explicit human `APPROVED` — request review (`gh pr ready` / `gh pr request-review` / ask in chat) and wait for `APPROVED`.

## Conventions

- **Deterministic, no LLM** — supervisor never calls a model; decisions are rule-based (`http !=200` → down, log pattern → error). Debug auto-fix (Phase 3) is rule-based (`autoFixKnownPatterns` + dry-boot transient check) and is spawned on-demand only after LKG rollback (max 3 attempts).
- **Daemon stays outside the tree** — the daemon (`bin.ts`/`supervisor.ts`/`snapshot.ts`/`health-poller.ts`, run via systemd) never adds a Cordis row or `cordis.patch.yml`; it must survive tree crashes. PID/port resolution via `ss -tlnp` + `resolve_tree()` like `dsh-safe-restart`.
- **The auto-resume plugin (`plugin.ts`/`index.ts` + `client/auto-reload.ts`) is the one deliberate exception** — it runs in-tree because it needs `sessions`/`connection`/`agents` (host) and `window`/`fetch`/`WebSocket` (client) context the daemon cannot reach. This is permitted only under two non-negotiable conditions:
  1. **`apply()` must never throw synchronously or let a rejected promise escape.** Every failure — expected or not — degrades to "auto-resume disabled for this boot," logged, never a crash. See `tests/plugin.test.ts` for the required coverage (a throwing `findInterrupted`, a throwing `resumeInterrupted`, a throwing RPC registration must all leave `apply()` non-throwing).
  2. **Before this package is ever added to a live profile's `bundles`** (e.g. `~/.dsh/profiles/web/package.json`), `pnpm build` must succeed AND a dry-boot on an ephemeral port with an isolated `DSH_HOME` must pass, per the `dsh-safe-restart` skill. This is not optional guidance — it is the only defense against a *load-time* failure (a missing `lib/index.js`, a stale build), which no amount of in-code `try`/`catch` can catch. This exact failure class caused repeated `dsh web` outages on 2026-08-27 (see the workspace's `<workspace-root>/docs/reports/2026-08-27-dsh-web-outage-postmortem.md`).
- **Injectable deps for testability** — `pollHealth`, `writeLKG`, `rollback`, `notify`, `findInterrupted`, `resumeSessions` are constructor-injected; tests mock them, real daemon wires to `health-poller`/`snapshot`/`restart-dsh-web.sh --auto` and `resumeViaRpc` (loopback fetch).
- **Snapshot rotation** — keep 3 LKG, verify sha256 before promote, `df` >500MB guard.
- **Debounce + rolling guard** — at most 1 rollback per 60s, single `rollingBack` flag, `flock` on `~/.dsh/.supervisor/lock` for cross-process safety.
- **Never block on notifier** — Telegram failures are swallowed and retried. Daemon never blocks rollback on `notify`.
- **Client auto-reload is hybrid:** client polling (`HEAD /` 1s on `offline`/`WebSocket close`) is primary (works when host is down); host `pollHealth` + `notify` after `restartWeb` is secondary. Together they cover manual, supervisor, and systemd restarts without `F5`.
- **Resume recovers route (fallback path only):** `sessionController.resolveAgent` resolves provider/model itself while composing the preset, so the supervisor tries it first. Only when it yields no agent does `resumeInterrupted` read `request/context` through the persistence handle seam to recover `provider`/`model` and pass `agentOptions` to `agents.resume()`, so a resumed agent does not fall back to a wrong model. A session with no recoverable route is skipped with a journal entry instead of being continued into a persona failure.
- **Resume keeps the agent preset:** activation AND verification both belong to the preset roster: `makePresetSetup()` mounts it through `ResumeAgentOptions.setup`, and `verifyResumedComposition()` asks `composedPreset(agent.ctx)` whether the binding exists, repairing with `recompose` when it does not. Never decide composition from a tool count (see `## Known Issues`).
- **Subagent awareness:** `findDanglingOpenTurns` does a **full log scan** for recent sessions (mtime within window, typically 1-2 files) — not just `tail -100` — because subagent `b6487e33` had its only `turn/start` at seq 6 at the very beginning of a 1906-line log, missed by tail. `findInterrupted` (tail 100) is sufficient because `turn/end interrupted` is always at the tail. The mtime pre-filter keeps full scans cheap (previously 5.5s for 425 sessions without it).

## Dependency patterns

### Supervisor → Notifier (1-way, loose by default, hard optional)

- **Loose (recommended):** No `package.json` dependency. `notifier.ts` tries `import('@ddtcorex/dsh-maestro-notifier')` dynamically, then `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` env, then falls back to `console.log`. `systemd` template leaves `Environment=TELEGRAM_*` commented — uncomment if you want Telegram, otherwise daemon logs only and never blocks rollback. This keeps supervisor runnable when notifier is not installed.
- **Hard (workspace):** Add to `package.json` `"dependencies": {"@ddtcorex/dsh-maestro-notifier": "workspace:^0.1.0"}` and to `pnpm-workspace.yaml` `packages: [".", "../dsh-maestro-notifier"]` + `allowBuilds.esbuild: true`. Then `pnpm install` resolves the link and `defaultSend` hits the hard import on every call. Use only if you want a guaranteed Telegram path and accept the coupled publish order (notifier must be published before supervisor).

### Two Cordis plugins that need each other (A ↔ B)

Never `A inject: ['B']` and `B inject: ['A']` — Cordis will deadlock. Pick one:

1. **Extract shared lib C** (like this package's own store): `C` provides `serviceC`, both `A` and `B` do `inject: ['serviceC']`, `C` injects nobody. When `C` is a package, put it in `pnpm-workspace.yaml` `packages: ["../dsh-maestro-C"]` for both. When `A` and `B` ship in one package, `C` is just a module they both import — which is what the store now does, and it costs no dependency at all. This is the cleanest for true mutual data (e.g., `guard` ↔ `observe` sharing health).
2. **One-way + events:** `A` provides `serviceA`, `B` does `inject: ['serviceA']` and `ctx.emit('b:done', payload)`; `A` listens with `ctx.on('b:done', ...)`. No reverse inject, so no cycle.
3. **Isolate + RPC:** If they must stay separate, use `isolate` realms and a `/dsh-maestro-A` RPC channel instead of direct `inject`.

### Client bundling

Host `tsc` outputs `lib/*.js` (flat, `rootDir src/host`). Client `tsc` outputs `.client-build/*.js` (CommonJS) for the typecheck and the d.ts in `lib/types/client/`, then `scripts/build-client.mjs` esbuild-bundles the ONE entry `src/client/index.tsx` into `lib/client.js` (`window.__ModuleLoader__.load` wrapper). `package.json` `dsh.client` declares `platform: web` + `inject: ["@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-ui-slots"]` and `exports["./client"]` points to `lib/client.js`. The `ClientModuleRegistry` (`@deepseek-ai/dsh-client-modules`) serves `/plugins/<id>/client.js` from that path. `pnpm build` must run both steps; `lib/client.js` is gitignored, so rebuild locally after pull and before restart.

## Validation

- `pnpm verify` + `pnpm test` green before any success claim (a suite needing `DSH_INTEGRATION=1` stays skipped by default). `test -f lib/index.js && test -f lib/client.js` after build.
- For daemon changes, manual ephemeral check: `DSH_HOME=$(mktemp -d) pnpm --dir deepseek-harness dsh web --port 0` + corrupt `settings.json` → assert report + rollback within 10s.
- For plugin changes, live check: `curl -s http://127.0.0.1:3080/dsh-maestro-supervisor-resume/scan -X POST ...` → `scanned`/`interrupted`, and `findDanglingOpenTurns` full scan finds subagent `b6487e33` within 5m. For client, `curl -s http://127.0.0.1:3080/plugins/@ddtcorex/dsh-maestro-supervisor/client.js | grep -c "window.location.reload"` → 2, and after `kill` + restart, `fetch HEAD /` polling reloads the page without `F5`.
- `pnpm --dir deepseek-harness dsh web --port 0` dry-boot must pass before adding to a live profile (see Conventions).

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `dsh: plugin tree failed to load: Cannot find package '.../dsh-maestro-supervisor/index.js'` | `pnpm build` not run or `lib/` stale, `link:` specifier left in lockfile | `pnpm --dir packages/dsh-maestro-supervisor build && pnpm --dir ~/.dsh/profiles/web install` then `DSH_HOME=$(mktemp -d) pnpm --dir deepseek-harness dsh web --port 0` dry-boot |
| `ERR_MODULE_NOT_FOUND` / `assertChannel` / `client-modules: ... declares dsh.client but exports no "./client" bundle` | Missing `lib/client.js` or `exports["./client"]` | `pnpm build` (host + client + `node scripts/build-client.mjs`), check `package.json` `exports` and `dsh.client`, `test -f lib/client.js` |
| `EADDRINUSE` on a dry-boot ephemeral port | Another process holds the ephemeral port (or a stale dry-boot orphan) | Run `dsh_web_gc` (preview, then `confirm:true`) to reap verified dry-boot orphans; for a live-tree collision pick another port. Never hardcode a PID, and never `pkill -f "dsh web"` (matches the invoking shell itself). |
| `session artifact ... uses .jsonl but backend is zstd` | Manually created `session.jsonl` while backend is `zstd` | Use `zstd -c plain.jsonl > session.jsonl.zstd` or use `JsonlSessionPersistence` API (`create`/`append`) which writes header + `compressZstdFrame`. Never hand-write `session.jsonl` when `compression: zstd`. |
| `corrupt Zstandard session log: first frame is not exactly one header line` | Hand-written zstd without `type: session` header (`version`, `id`, `createdAt`, `delegationDepth`) | Use `toHeaderLine` + `compressZstdFrame(header)` + `compressZstdFrame(body)` as in `encodeMaterialization`, or copy a real header via `zstd -d -c real.zstd \| head -n 1`. |
| `findDangling` returns 0 but subagent is still running (open `turn/start` at beginning) | Tail window too small (`tail -20`/`tail -100` misses far-back open turn) | Fixed in `63b7719`: `findDangling` now does **full scan** for recent sessions (mtime within window, 1-2 files) — not tail. `findInterrupted` stays tail 100 (interrupted closer is always at tail). |
| `RESUME FAILED: loopback unavailable` or `resumed: []` | Activation failed: no `sessionController`, no `sessionPersistence`, no recoverable `provider`/`model`, the preset could not be composed, or the session was not found | Check the session's log exists under `~/.dsh/sessions/<project>/<id>/` (resolve the name with `resolveSessionLogPath`, e.g. `session.v4.jsonl.zstd` today) and `zstd -d -c ... \| head -n 1` is a valid header, then `~/.dsh/.supervisor/resume.log.jsonl` for the journal entry (`resume-failed` names the reason). A routeless session is skipped on purpose rather than continued into a persona failure; a `setup` failure (`agent preset ... could not be composed`) aborts the session so it is never continued without its tools. |
| `RESUME SKIPPED: no interrupted sessions could be re-attached` | No session within `autoResumeWithin` window or all filtered by `sinceMs` | Increase `autoResumeWithin` (e.g. `10` or `"10m"`), check `~/.dsh/.supervisor/config.json` and `DSH_SUPERVISOR_RESUME_WITHIN` env, verify `findDangling` with `withinMs: 60*60*1000` finds it. |
| Page does not reload after `dsh web` restart | Client `lib/client.js` not served (missing `exports` or not built) or browser cache | `curl -s http://127.0.0.1:3080/plugins/@ddtcorex/dsh-maestro-supervisor/client.js \| grep -c "window.location.reload"` → 2, hard refresh `Ctrl+Shift+R`, check `window.__ModuleLoader__` in devtools console. Client polls `HEAD /` 1s on `offline`/`WebSocket close` — it needs `dsh.client` to be loaded. |
| `dangling` found but `agents.get` says already live (skip) | Session is still live in current process (not a crash) | `findDangling` is only safe right after fresh boot when `dsh web` is sole owner. `resumeInterrupted` additionally checks `agents.get(sessionId)` and skips if live — this is correct, not a bug. Wait for next boot. |
| Daemon `reports` not written or `lkg` not rotated | `df` guard (<500MB) or `flock` on `~/.dsh/.supervisor/lock` failed | Check `df -h ~/.dsh`, `ls -l ~/.dsh/.supervisor/lkg/`, `cat ~/.dsh/.supervisor/supervisor.log`, `ls -l ~/.dsh/.supervisor/lock`. Daemon never blocks on notifier, but `writeLKG` is throttled to 1 per 5m. |
| Tests fail with `zstd: command not found` | `zstd` not installed | `sudo apt install zstd` (or `brew install zstd`). Tests skip zstd suites if unavailable, but live `findDangling` needs it. |

## Known Issues

- **A tool count is not a composition oracle.** Do not decide "this agent is
  healthy" from `tools.schemas(...)` read out of band: measured 2026-09-14, a
  plugin-side read returned the 76-tool deployment-global view even for a
  perfectly healthy session, while the harness's own Tool inspect provider
  (`ctx.tools.schemas(context.agent)`) resolved the same agent to its full set.
  The authoritative question is `agentPresets.composedPreset(agent.ctx)` —
  `composedPresetId()` in `preset.ts` — and that is what `verifyResumedComposition`
  uses.
- **Subagent resume needs full scan:** Before `63b7719`, `findDangling` used `tail -20`/`tail -100`, missing subagent `b6487e33` whose only `turn/start` was at seq 6 at the very beginning of a 1906-line log. Fixed by full scan for recent sessions (mtime within window). If you add a new scan variant, reuse `readSessionAllLines` with mtime pre-filter, not a new tail.
- **Session log names are generation-numbered — never enumerate them.** The harness writes the log as `session.jsonl[.zstd]` (generation 0) or `session.v<N>.jsonl[.zstd]`, chosen by `generationLogFilename(version, compression)` with an unbounded `N`. A literal list of names goes blind the moment the harness bumps the generation, and it fails SILENTLY — the scan simply reports "no session". It happened twice: v3 on 2026-09-11 (auto-resume found nothing after a restart, fixed by adding v3 to the list) and v4 on 2026-09-23 (`findInterrupted` reported `0/418` interrupted while an interrupted session sat in the tree, the boot pre-flight had zero files to classify, and `resolveSessionPresetId` read no header — 27 of 418 session dirs were invisible). The durable fix is `resolveSessionLogPath()` in `src/host/session-log-file.ts`, which PARSES the generation and picks the newest: every caller (`resume.ts`, `session-health.ts`, `plugin.ts`, `preset.ts`) resolves through it. When adding a caller, resolve — do not list.
- **Manual `session.jsonl` vs `zstd`:** Hand-writing `session.jsonl` when the backend is `zstd` crashes the entire `dsh web` at `workspace` init (`encodingMismatch`). Always use the backend's `zstd` path and header (`type: session`) or the `dsh` CLI to create sessions. The workspace `listArtifacts` checks every project dir for opposite-encoding files on every boot — one stray file blocks all of `dsh web`.
- **Port pair `3000`/`3080`:** One `MainThread` holds both. Killing only the `3080` pid via `ss -tlnp` must also free `3000` (same pid). `pkill -f "dsh web"` matches the test shell itself — use `ss -tlnp | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | xargs kill` instead.
- **Client `lib/client.js` must be `window.__ModuleLoader__.load`:** Plain `export function apply` from `tsc` is not enough; `scripts/build-client.mjs` wraps `.client-build` into the loader shape. If you add a new client file, add it under `src/client/` and ensure `tsconfig.client.json` includes it, then `pnpm build` (which runs the wrapper).
- **Config precedence is subtle:** `cordis.patch.yml` `config:` wins over env, which wins over `config.json`, which wins over `settings.json`. A bare `5` in `DSH_SUPERVISOR_RESUME_WITHIN` means 5 minutes (env ergonomics), not 5ms. See `plugin.ts:71` and `supervisor.ts:82`.
- **Live check needs `zstd`:** `findDangling`/`findInterrupted` decompress via `zstd -d -c ... | tail`. Without `zstd`, tests skip but live resume will fail to find sessions. Install `zstd`.

## See Also

- Spec: `<workspace-root>/docs/specs/2026-08-27-dsh-web-resilience-design.md` (Maestro Harness workspace, Granularization hybrid)
- Skill: `skills/dsh-safe-restart/` (guarded `restart-dsh-web.sh` with `dry_boot_and_verify()` and `--auto`, ephemeral `DSH_HOME`, `ss -tlnp` pid resolution)
- Plan: `<workspace-root>/docs/plans/2026-08-27-dsh-web-resilience-phase1.md` (transient, deleted after ship)
- Client bundling: `dsh-maestro-mobile` (`scripts/build-client.mjs` pattern, `window.__ModuleLoader__.load`)
- Reports: `<workspace-root>/docs/reports/2026-08-27-dsh-web-outage-postmortem.md` (load-time failure class)
