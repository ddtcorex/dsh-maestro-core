import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/client')
const read = (f: string) => readFileSync(resolve(clientDir, f), 'utf8')

describe('Task 3: Settings UI tabs', () => {
  it('live settings card renders Guard tab', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('Guard')
  })

  it('Settings has pills for Guard, Supervisor and Notifier (Blacklist merged into Guard)', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('Guard')
    expect(src).toContain('Supervisor')
    expect(src).toContain('Notifier')
    // The standalone Blacklist pill is gone; its editor lives as a section
    // inside the Guard tab.
    expect(src).not.toMatch(/id: 'blacklist'/)
    expect(src).toContain('Blacklist')
  })

  it('Guard tab speaks schema v2: per-rule tiers, branches, paths, containment, journal', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('saveGuardRule')
    expect(src).toContain('protectedBranches')
    expect(src).toContain('protectedPaths')
    expect(src).toContain('workingDirContainment')
    expect(src).toContain('retainDays')
    expect(src).toContain('retainFiles')
    // Rule ids live in guard-view.ts (RULE_META); the tab renders them grouped.
    expect(read('guard-view.ts')).toContain('guard.tamper')
    expect(src).toContain('Self-protection')
    // Text fields commit on blur/Enter, never per keystroke.
    expect(src).toContain('function CommitField')
    // 'Default' unsets the override (null) instead of echoing the tier.
    expect(src).toContain('ruleTierPatch')
    // Multi-value fields use one row per value, not comma-joined text.
    expect(src).toContain('function ListEditor')
    expect(src).toContain('One branch per row')
    expect(src).toContain('One path per row')
    // Status card stacks on narrow screens (shell keeps its nav column).
    expect(src).toContain('data-maestro-guard-status')
    // Boot-time knobs say they need a restart.
    expect(src).toContain('once at boot')
  })

  it('Blacklist editor lives inside the Guard tab as row-based offline scan list', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('Blacklist patterns')
    expect(src).toContain('Publish scan list (offline)')
    expect(src).toContain('One pattern per row')
    // The writer persists the patterns array (rows commit the whole list).
    expect(src).toMatch(/cfgSet\('guardBlacklist',\s*\{\s*patterns/)
    // The placeholders half of this editor was removed 2026-09-14: nothing read
    // `guardBlacklist.placeholders` — not the guard runtime, not even
    // check-public-blacklist.mjs, its sibling field's one consumer.
    expect(src).not.toContain('placeholders')
    // The textarea is gone with the line-based editor; rows use ListEditor.
    expect(src).toContain('function ListEditor')
    expect(src).not.toContain('TextareaField')
  })

  it('Supervisor tab has intervalMs etc', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('intervalMs')
  })

  it('Notifier tab has telegram fields', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('telegram')
  })

  it('host exposes guard/guardBlacklist domains via RPC get/set/unset (generic channel)', () => {
    const host = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/host/index.ts'), 'utf8')
    expect(host).toContain('/dsh-maestro-config')
    expect(host).toContain("'get'")
    expect(host).toContain("'set'")
    expect(host).toContain("'unset'")
  })

  it('client index wires configRpcCall for guard domains', () => {
    const entry = read('index.tsx')
    expect(entry).toContain('configRpcCall')
    expect(entry).toContain('/dsh-maestro-config')
  })

  it('review section has the global Review-on-assign toggle', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('Review on assign')
    expect(src).toContain('autoReviewOnAssign')
  })

  it('project rows have per-project push/assign tri-state overrides', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('rereviewOnPush')
    expect(src).toContain('reviewOnAssign')
    expect(src).toContain('Inherit (global)')
  })
})
