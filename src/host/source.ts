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
 */
export const SUPERVISOR_SOURCE_KIND = 'plugin:@ddtcorex/dsh-maestro-supervisor'
