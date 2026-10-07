import { DEFAULT_TIERS } from './rules.js'
import { defaultProtectedPaths, guardConfigPaths } from './paths.js'
import type { Tier } from './tiers.js'

/**
 * Schema v2 of `domains.guard`. Every decision the pipeline makes is a lookup
 * on this object: `classify` produces a rule id, `decide` maps it through
 * `rules`, and the settings lists feed the classifier's path/branch checks.
 *
 * {@link mergeGuardConfig} reads a persisted v2 document.
 */
export interface GuardConfigV2 {
  rules: Record<string, Tier>
  protectedBranches: string[]
  protectedPaths: string[]
  guardPaths: string[]
  journal: { enabled: boolean; retainDays: number; retainFiles: number; allowCounters: boolean }
  workingDirContainment: { enabled: boolean; spillReads: boolean }
}

/**
 * Built-in defaults. Protection is ON for everything that can be on: a missing,
 * unreadable or half-written config must never turn a gate off, so every
 * fallback path lands here rather than on an empty object.
 */
export const DEFAULT_CONFIG: GuardConfigV2 = {
  rules: { ...DEFAULT_TIERS },
  protectedBranches: ['master', 'main'],
  protectedPaths: defaultProtectedPaths(),
  guardPaths: guardConfigPaths(),
  journal: { enabled: true, retainDays: 30, retainFiles: 14, allowCounters: true },
  workingDirContainment: { enabled: true, spillReads: true },
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is string => typeof x === 'string')
  return out.length > 0 ? out : undefined
}

/**
 * A retention window must be a POSITIVE INTEGER. The journal block used to be
 * spread into the defaults unvalidated, and `rotate()` multiplies/compares with
 * both windows: `retainDays: "30"` makes the day cutoff `NaN` and
 * `retainFiles: "14"` makes the file window compare false, so BETWEEN them a
 * non-numeric value prunes EVERY archive. An invalid value falls back to the
 * built-in default — the fail-safe direction for a retention window.
 *
 * The value is never floored: `0.5` passed the `> 0` check and `Math.floor`
 * turned it into 0, which prunes every archive — the very failure this
 * validation exists to prevent. A window counts days/files, so a fraction is
 * simply invalid and falls back like any other bad value.
 */
function positiveInt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined
}

/** A boolean config switch, or the built-in default when it is not a boolean. */
function booleanOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

/**
 * Merge the persisted `domains.guard` object onto the defaults. Only keys that
 * are actually present are overlaid, and `rules` merges per rule id, so a
 * partial config can neither drop the default tiers nor unset the protected
 * path lists.
 */
export function mergeGuardConfig(raw: unknown): GuardConfigV2 {
  const base: GuardConfigV2 = {
    ...DEFAULT_CONFIG,
    rules: { ...DEFAULT_CONFIG.rules },
    protectedBranches: [...DEFAULT_CONFIG.protectedBranches],
    protectedPaths: [...DEFAULT_CONFIG.protectedPaths],
    guardPaths: [...DEFAULT_CONFIG.guardPaths],
    journal: { ...DEFAULT_CONFIG.journal },
    workingDirContainment: { ...DEFAULT_CONFIG.workingDirContainment },
  }
  if (!isPlainObject(raw)) return base

  if (isPlainObject(raw.rules)) {
    for (const [rule, tier] of Object.entries(raw.rules)) {
      if (typeof tier === 'string') base.rules[rule] = tier as Tier
    }
  }
  base.protectedBranches = stringArray(raw.protectedBranches) ?? base.protectedBranches
  base.protectedPaths = stringArray(raw.protectedPaths) ?? base.protectedPaths
  base.guardPaths = stringArray(raw.guardPaths) ?? base.guardPaths
  if (isPlainObject(raw.journal)) {
    const j = raw.journal as Record<string, unknown>
    base.journal = {
      enabled: booleanOr(j.enabled, base.journal.enabled),
      allowCounters: booleanOr(j.allowCounters, base.journal.allowCounters),
      retainDays: positiveInt(j.retainDays) ?? base.journal.retainDays,
      retainFiles: positiveInt(j.retainFiles) ?? base.journal.retainFiles,
    }
  }
  if (isPlainObject(raw.workingDirContainment)) {
    const c = raw.workingDirContainment as Record<string, unknown>
    base.workingDirContainment = {
      enabled: booleanOr(c.enabled, base.workingDirContainment.enabled),
      spillReads: booleanOr(c.spillReads, base.workingDirContainment.spillReads),
    }
  }
  return base
}

/**
 * Read the raw `domains.guard` value from the shared Maestro settings store. A
 * missing store, an absent domain or an unreadable file all yield `undefined`:
 * the caller falls back to the built-in defaults, so the guard's own
 * protection may degrade in precision, never in coverage.
 */
async function readGuardDomain(dshHome?: string): Promise<unknown> {
  try {
    const mod: any = await import('../store/index.js')
    const opts = dshHome === undefined ? undefined : { dshHome }
    if (typeof mod.load === 'function') {
      const doc = await mod.load(opts)
      return doc?.domains?.guard
    }
    if (typeof mod.get === 'function') {
      return await mod.get('guard', opts)
    }
  } catch (e) {
    console.error('[dsh-maestro-guard] guard config read failed, using defaults:', (e as Error)?.message)
  }
  return undefined
}

/**
 * The per-call read the guard handler performs on every tool call: the
 * persisted `domains.guard` merged onto the built-in defaults.
 */
export async function loadGuardConfig(dshHome?: string): Promise<GuardConfigV2> {
  return mergeGuardConfig(await readGuardDomain(dshHome))
}
