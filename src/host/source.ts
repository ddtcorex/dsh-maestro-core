/**
 * The producer-owned source kind this plugin stamps on every message it injects
 * into a session.
 *
 * Session format v4 requires the producer to name itself (`plugin:<package>`)
 * and rejects the retired bare `kind: 'plugin'` outright. `kind: 'user'` is
 * admissible but false: these turns are machine-initiated, and consumers
 * classify a turn by this kind — dsh-maestro-memory's write guard documents
 * that plugin-initiated turns carry no per-turn write duty and can only honour
 * that when the producer says who it is.
 *
 * Scope, so the claim stays honest: this covers the two `agent.followup`
 * injections in `plugin.ts` and `resume-tools.ts`. The third delivery path —
 * `promptOwnedSession` through `sessionController.prompt` — cannot carry a kind
 * because the controller hardcodes `'user'`; that gap is documented at the call
 * site and tracked as a follow-up in
 * `docs/specs/2026-09-28-cross-repo-upstream-v4-lessons-design.md`.
 */
export const SUPERVISOR_SOURCE_KIND = 'plugin:@ddtcorex/dsh-maestro-supervisor'
