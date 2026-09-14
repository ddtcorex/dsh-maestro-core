/**
 * Guard settings view-model (schema v2).
 *
 * The guard runtime (`dsh-maestro-guard/src/host/`) owns the authoritative
 * schema (`GuardConfigV2`) and its legacy migration (`mapLegacyConfig`). This
 * module mirrors both for DISPLAY ONLY so the Settings tab can render the
 * effective state of a stored `domains.guard` document that may still carry
 * the v1 keys (`gitProtection` / `publishBlocked` / `cwdContainment` /
 * `credentialPaths`).
 *
 * Sync contract: `RULE_META` (ids, groups, default tiers) must match
 * `RULE_IDS` + `DEFAULT_TIERS` in `dsh-maestro-guard/src/host/rules.ts`, and
 * `effectiveGuardView` must match `mapLegacyConfig` + `DEFAULT_CONFIG` in
 * `dsh-maestro-guard/src/host/config.ts`. `tests/guard-view.spec.ts` pins the
 * parity against the sibling source; a guard-side rename breaks that test
 * instead of silently desyncing this tab.
 */

export type GuardTier = 'allow' | 'journal' | 'ask' | 'deny'

export const GUARD_TIERS: readonly GuardTier[] = ['allow', 'journal', 'ask', 'deny']

export function isGuardTier(v: unknown): v is GuardTier {
  return v === 'allow' || v === 'journal' || v === 'ask' || v === 'deny'
}

export type GuardRuleGroup = 'Git' | 'Publish' | 'Filesystem' | 'Network' | 'Self-protection'

export interface GuardRuleMeta {
  id: string
  group: GuardRuleGroup
  label: string
  hint: string
  defaultTier: GuardTier
  /** True when the tier is a structural floor the UI must not offer below. */
  locked?: boolean
}

/**
 * The closed rule set with the copy the tab shows. `defaultTier` mirrors
 * `DEFAULT_TIERS`; `hint` names the trigger in one line so the tab doubles as
 * documentation. `guard.tamper` is `locked`: the runtime's `decide()` treats
 * `deny` as a structural floor, so the selector offers no downgrade.
 */
export const RULE_META: readonly GuardRuleMeta[] = [
  { id: 'git.push.protected', group: 'Git', label: 'Push to protected branch', hint: 'Direct push to master/main (or your branch list).', defaultTier: 'ask' },
  { id: 'git.merge.protected', group: 'Git', label: 'Merge into protected branch', hint: 'Local merge targeting a protected branch.', defaultTier: 'journal' },
  { id: 'git.tag.release', group: 'Git', label: 'Release tag push', hint: 'Pushing a version-looking tag (v1.2.3).', defaultTier: 'ask' },
  { id: 'git.push.force', group: 'Git', label: 'Force push', hint: 'push --force / --force-with-lease anywhere.', defaultTier: 'ask' },
  { id: 'gh.release.create', group: 'Publish', label: 'Create GitHub/GitLab release', hint: 'gh release create and equivalents.', defaultTier: 'ask' },
  { id: 'gh.protection.delete', group: 'Publish', label: 'Delete branch protection', hint: 'Removing protection rules from a branch.', defaultTier: 'ask' },
  { id: 'pkg.publish', group: 'Publish', label: 'Publish a package', hint: 'pnpm/npm publish and tag pushes that trigger it.', defaultTier: 'ask' },
  { id: 'secret.access', group: 'Filesystem', label: 'Read a secret location', hint: 'Any read of a protected credential path.', defaultTier: 'ask' },
  { id: 'fs.write.outside', group: 'Filesystem', label: 'Write outside working dir', hint: 'File writes escaping the session cwd (temp dir exempt).', defaultTier: 'ask' },
  { id: 'net.exec.remote', group: 'Network', label: 'Remote execution', hint: 'ssh / cloudflared-tunnelled commands.', defaultTier: 'ask' },
  { id: 'guard.tamper', group: 'Self-protection', label: 'Edit guard config or journal', hint: 'Any write to the guard settings or its audit trail.', defaultTier: 'deny', locked: true },
]

/** The three git rules the legacy `gitProtection.enabled: false` used to gate. */
const LEGACY_GIT_RULES: readonly string[] = ['git.push.protected', 'git.tag.release', 'git.push.force']

export type TierSource = 'default' | 'stored' | 'legacy'

export interface GuardRuleView extends GuardRuleMeta {
  tier: GuardTier
  source: TierSource
}

export interface GuardView {
  rules: GuardRuleView[]
  protectedBranches: string[]
  branchesSource: TierSource
  /** Extra user paths; the built-in always-blocked list lives in the runtime. */
  protectedPaths: string[]
  containment: { enabled: boolean; spillReads: boolean }
  journal: { enabled: boolean; allowCounters: boolean; retainDays: number; retainFiles: number }
}

const DEFAULT_BRANCHES: readonly string[] = ['master', 'main']

function stringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  return out.length > 0 ? out : undefined
}

function booleanOr(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function positiveIntOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : fallback
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Compute what the tab shows for a stored `domains.guard` document. Precedence
 * mirrors the runtime: an explicit v2 entry wins, a legacy boolean fills the
 * gap it used to own, otherwise the built-in default renders.
 */
export function effectiveGuardView(raw: unknown): GuardView {
  const doc = isRecord(raw) ? raw : {}
  const storedRules = isRecord(doc.rules) ? doc.rules : {}

  const rules: GuardRuleView[] = RULE_META.map((meta) => {
    const stored = storedRules[meta.id]
    if (isGuardTier(stored)) return { ...meta, tier: stored, source: 'stored' }
    const legacyTier = legacyTierFor(meta.id, doc)
    if (legacyTier !== undefined) return { ...meta, tier: legacyTier, source: 'legacy' }
    return { ...meta, tier: meta.defaultTier, source: 'default' }
  })

  const v2Branches = stringArray(doc.protectedBranches)
  const legacyBranches = isRecord(doc.gitProtection) ? stringArray(doc.gitProtection.branches) : undefined
  const protectedBranches = v2Branches ?? legacyBranches ?? [...DEFAULT_BRANCHES]

  const v2Paths = stringArray(doc.protectedPaths) ?? []
  const legacyPaths = stringArray(doc.credentialPaths) ?? []
  const protectedPaths = [...new Set([...v2Paths, ...legacyPaths])]

  const containmentRaw = isRecord(doc.workingDirContainment) ? doc.workingDirContainment : {}
  // Legacy `cwdContainment: false` meant "fs.write.outside journals instead of
  // asking"; it never disabled containment, so `enabled` stays true and only
  // the rule tier above reflects it.
  const containment = {
    enabled: booleanOr(containmentRaw.enabled, true),
    spillReads: booleanOr(containmentRaw.spillReads, true),
  }

  const journalRaw = isRecord(doc.journal) ? doc.journal : {}
  const journal = {
    enabled: booleanOr(journalRaw.enabled, true),
    allowCounters: booleanOr(journalRaw.allowCounters, true),
    retainDays: positiveIntOr(journalRaw.retainDays, 30),
    retainFiles: positiveIntOr(journalRaw.retainFiles, 14),
  }

  return {
    rules,
    protectedBranches,
    branchesSource: v2Branches !== undefined ? 'stored' : legacyBranches !== undefined ? 'legacy' : 'default',
    protectedPaths,
    containment,
    journal,
  }
}

/** The tier a legacy v1 document implies for one rule, if any. */
function legacyTierFor(ruleId: string, doc: Record<string, unknown>): GuardTier | undefined {
  if (LEGACY_GIT_RULES.includes(ruleId)) {
    const gp = doc.gitProtection
    if (isRecord(gp) && Object.keys(gp).length > 0 && gp.enabled === false) return 'journal'
    return undefined
  }
  if (ruleId === 'pkg.publish' && doc.publishBlocked === false) return 'journal'
  if (ruleId === 'fs.write.outside' && doc.cwdContainment === false) return 'journal'
  return undefined
}

/**
 * Split a comma-separated list field (branches, paths) the way the tab's text
 * inputs commit it: trim, drop empties, de-duplicate.
 */
export function parseListField(text: string): string[] {
  return [...new Set(text.split(',').map((s) => s.trim()).filter((s) => s !== ''))]
}

/** True when at least one rule renders from a non-default source. */
export function hasCustomTiers(view: GuardView): boolean {
  return view.rules.some((r) => r.source !== 'default')
}

/**
 * Patch that sets one rule's tier, or unsets it back to the built-in default.
 * Unset is an explicit null: the store's deep-merge cannot delete keys, but
 * the runtime's `mergeGuardConfig` only copies string tiers, so a null is
 * dropped at merge time and `decide()` never sees it — unlike writing the
 * default tier out explicitly, which `decide()` ignores as an echo yet would
 * still render as "customized" here. `effectiveGuardView` above treats null
 * like an absent entry (not a tier), so the row returns to `default`.
 */
export function ruleTierPatch(ruleId: string, tier: GuardTier | 'default'): Record<string, GuardTier | null> {
  return { [ruleId]: tier === 'default' ? null : tier }
}
