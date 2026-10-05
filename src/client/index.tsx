/**
 * dsh-maestro-core — composed client bundle entry.
 *
 * One browser bundle registers every client surface this package owns: the
 * supervisor auto-reload, the Maestro settings card and the Maestro Sync card.
 * Each module apply is wrapped in its own try/catch so one broken surface never
 * costs the other two their registration — a settings card that throws on
 * mount must not also take the reload poller down with it.
 */
import { apply as applyAutoReload } from './auto-reload.js'
import { apply as applyConfig } from './config/index.js'
import { apply as applySync } from './sync/index.js'

/** Union of what the three modules need from the client context. */
export const inject = ['slots', 'connection'] as const

type ClientCtx = Parameters<typeof applyAutoReload>[0]

const MODULES = [
  ['auto-reload', applyAutoReload],
  ['config', applyConfig],
  ['sync', applySync],
] as const

export function apply(ctx: ClientCtx): void {
  for (const [name, register] of MODULES) {
    try {
      register(ctx as never)
    } catch (err) {
      console.error(`[dsh-maestro-core] ${name} client module failed to apply`, err)
    }
  }
}