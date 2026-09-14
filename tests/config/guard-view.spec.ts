import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  RULE_META,
  effectiveGuardView,
  hasCustomTiers,
  parseListField,
  ruleTierPatch,
} from '../src/client/guard-view.js'

const here = dirname(fileURLToPath(import.meta.url))
const guardRulesPath = resolve(here, '../../dsh-maestro-guard/src/host/rules.ts')
const guardConfigPath = resolve(here, '../../dsh-maestro-guard/src/host/config.ts')
/**
 * The parity suite needs the guard sibling checkout, which exists in a local
 * workspace but NOT in CI (config's ci.yml clones only config-lib). Skip
 * there instead of failing: local runs still catch drift at dev time, and a
 * guard-side change must never turn this repo's CI red from afar.
 */
const hasGuardSibling = existsSync(guardRulesPath) && existsSync(guardConfigPath)
/** Sibling source, read as text: the client bundle must never import it. */
const guardRulesSrc = hasGuardSibling ? readFileSync(guardRulesPath, 'utf8') : ''
const guardConfigSrc = hasGuardSibling ? readFileSync(guardConfigPath, 'utf8') : ''

function siblingRuleIds(): string[] {
  const block = guardRulesSrc.match(/RULE_IDS = \[(.*?)\] as const/s)?.[1] ?? ''
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1])
}

function siblingDefaultTiers(): Record<string, string> {
  const block = guardRulesSrc.match(/DEFAULT_TIERS[^=]*= \{(.*?)\n\}/s)?.[1] ?? ''
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) out[m[1]] = m[2]
  return out
}

describe.skipIf(!hasGuardSibling)('guard-view parity with the guard runtime', () => {
  it('covers exactly the closed RULE_IDS set', () => {
    expect(RULE_META.map((r) => r.id).sort()).toEqual(siblingRuleIds().sort())
  })

  it('default tiers match DEFAULT_TIERS', () => {
    const expected = siblingDefaultTiers()
    for (const meta of RULE_META) {
      expect(meta.defaultTier, meta.id).toBe(expected[meta.id])
    }
  })

  it('retention/containment fallbacks match DEFAULT_CONFIG', () => {
    expect(guardConfigSrc).toContain('retainDays: 30')
    expect(guardConfigSrc).toContain('retainFiles: 14')
    const view = effectiveGuardView(undefined)
    expect(view.journal.retainDays).toBe(30)
    expect(view.journal.retainFiles).toBe(14)
    expect(view.containment).toEqual({ enabled: true, spillReads: true })
  })
})

describe('effectiveGuardView', () => {
  it('empty document renders all defaults', () => {
    const view = effectiveGuardView(undefined)
    expect(view.rules.every((r) => r.source === 'default' && r.tier === r.defaultTier)).toBe(true)
    expect(view.protectedBranches).toEqual(['master', 'main'])
    expect(view.protectedPaths).toEqual([])
    expect(hasCustomTiers(view)).toBe(false)
  })

  it('legacy booleans surface as legacy-sourced journal tiers', () => {
    const view = effectiveGuardView({
      gitProtection: { enabled: false, branches: ['main', 'release'] },
      publishBlocked: false,
      cwdContainment: false,
      credentialPaths: ['~/.config/extra.yaml'],
    })
    const tierOf = (id: string) => view.rules.find((r) => r.id === id)
    expect(tierOf('git.push.protected')).toMatchObject({ tier: 'journal', source: 'legacy' })
    expect(tierOf('git.tag.release')).toMatchObject({ tier: 'journal', source: 'legacy' })
    expect(tierOf('git.push.force')).toMatchObject({ tier: 'journal', source: 'legacy' })
    // A git rule the legacy key never owned stays default.
    expect(tierOf('git.merge.protected')).toMatchObject({ tier: 'journal', source: 'default' })
    expect(tierOf('pkg.publish')).toMatchObject({ tier: 'journal', source: 'legacy' })
    expect(tierOf('fs.write.outside')).toMatchObject({ tier: 'journal', source: 'legacy' })
    expect(view.protectedBranches).toEqual(['main', 'release'])
    expect(view.branchesSource).toBe('legacy')
    expect(view.protectedPaths).toEqual(['~/.config/extra.yaml'])
    expect(hasCustomTiers(view)).toBe(true)
  })

  it('an explicit v2 entry beats the legacy boolean', () => {
    const view = effectiveGuardView({
      publishBlocked: false,
      rules: { 'pkg.publish': 'deny' },
      protectedBranches: ['main'],
    })
    expect(view.rules.find((r) => r.id === 'pkg.publish')).toMatchObject({ tier: 'deny', source: 'stored' })
    expect(view.protectedBranches).toEqual(['main'])
    expect(view.branchesSource).toBe('stored')
  })

  it('invalid windows and non-tiers fall back instead of persisting garbage', () => {
    const view = effectiveGuardView({
      rules: { 'pkg.publish': 'sometimes' },
      journal: { retainDays: '30', retainFiles: 0.5 },
    })
    expect(view.rules.find((r) => r.id === 'pkg.publish')).toMatchObject({ tier: 'ask', source: 'default' })
    expect(view.journal.retainDays).toBe(30)
    expect(view.journal.retainFiles).toBe(14)
  })
})

describe('parseListField', () => {
  it('trims, drops empties and de-duplicates', () => {
    expect(parseListField('main, master ,, main,  release ')).toEqual(['main', 'master', 'release'])
    expect(parseListField('')).toEqual([])
  })
})

describe('ruleTierPatch', () => {
  it('unsets with null so the row returns to default', () => {
    expect(ruleTierPatch('pkg.publish', 'default')).toEqual({ 'pkg.publish': null })
    // A stored null renders as the built-in tier, not as a customization —
    // the runtime's merge drops non-string tiers before decide() runs.
    const view = effectiveGuardView({ rules: { 'pkg.publish': null } })
    expect(view.rules.find((r) => r.id === 'pkg.publish')).toMatchObject({ tier: 'ask', source: 'default' })
    expect(hasCustomTiers(view)).toBe(false)
  })

  it('passes explicit tiers through', () => {
    expect(ruleTierPatch('pkg.publish', 'deny')).toEqual({ 'pkg.publish': 'deny' })
  })
})
