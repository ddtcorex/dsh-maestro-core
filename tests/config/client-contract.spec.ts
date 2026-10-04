import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/client/config')
const read = (f: string) => readFileSync(resolve(clientDir, f), 'utf8')

describe('settings section registration contract', () => {
  const entry = read('index.tsx')

  it('registers as "Maestro" after the archived-sessions page, never tied with it', () => {
    expect(entry).toContain("id: 'maestro'")
    // The shell sorts settings.section rows by order alone, so a shared number
    // leaves the relative order undefined: upstream's archived-sessions page
    // owns 25 and this tab used to collide with it, swapping places between
    // loads. Pin the resolved value through the exported constant the
    // registration reads, and keep the literal out of the register call.
    expect(entry).toContain('export const MAESTRO_SETTINGS_ORDER = 26')
    expect(entry).toContain('order: MAESTRO_SETTINGS_ORDER')
    expect(entry).not.toContain('order: 25')
    expect(entry).toMatch(/label:\s*\(\)\s*=>\s*'Maestro'/)
    expect(entry).not.toContain('Maestro Config')
  })

  it('speaks only the config and supervisor channels, never the review channel', () => {
    expect(entry).toContain("'/dsh-maestro-config'")
    expect(entry).toContain("'/dsh-maestro-supervisor-resume'")
    expect(entry).toMatch(/inject:\s*\(\)\s*=>\s*\(\{\s*configRpcCall,\s*supervisorRpcCall\s*\}\)/)
    expect(entry).not.toContain('dsh-maestro-review')
    expect(entry).not.toContain('MAESTRO_RPC_CHANNEL')
    expect(existsSync(resolve(clientDir, 'api.ts'))).toBe(false)
  })

  it('offers exactly the Guard and Supervisor tabs, Guard first', () => {
    const live = read('MaestroSettings.tsx')
    expect(live).toContain("useState('guard')")
    expect(live).toContain("{ id: 'guard', label: 'Guard', icon: 'shield' }")
    expect(live).toContain("{ id: 'supervisor', label: 'Supervisor', icon: 'cpu' }")
    for (const gone of ['tunnel', 'gitlab', 'review', 'notifier']) expect(live).not.toContain(`{ id: '${gone}'`)
  })

  it('installs the settings-nav icon marker and disposes it', () => {
    expect(entry).toContain('registerSettingsNavIcon')
    expect(entry).toContain('SETTINGS_NAV_CSS')
    expect(entry).toMatch(/ctx\.effect\([\s\S]*?registerSettingsNavIcon/)
  })

  it('keeps the card visuals (alias tokens, masked secrets, sections)', () => {
    const card = read('MaestroSettings.tsx')
    expect(card).toContain('--dsw-alias-border-l2')
    expect(card).toContain('--dsw-alias-bg-layer-3')
    // audio-lines glyph mask from the old bundle. The mask literal lives in
    // maestro-mark.ts — the react-free half of the workspace reference
    // implementation, re-exported by components/BrandMark.tsx; index.tsx builds
    // its data-URI from maestroMarkMaskUri() at runtime, so the prefix is a
    // literal only in that file.
    expect(card + entry + read('maestro-mark.ts')).toContain('data:image/svg+xml')
    expect(read('settings-nav-icon.ts')).toContain('data-maestro-settings-nav')
  })
})

/**
 * Cross-repo Settings UI remediation (2026-09-14). Each case pins a defect the
 * audit found on a live install, so a refactor breaks a test instead of
 * silently restoring the defect.
 */
describe('settings UI remediation pins', () => {
  const live = read('MaestroSettings.tsx')
  const entry = read('index.tsx')

  it('removes the dead guardBlacklist.placeholders field entirely', () => {
    // Nothing reads placeholders (not even check-public-blacklist.mjs), so the
    // editor, its state, its writer and its CSS must all be gone.
    expect(live).not.toContain('PlaceholderMappingsEditor')
    expect(live).not.toContain('commitPlaceholders')
    expect(live).not.toContain('placeholderRows')
    expect(live).not.toContain('data-maestro-placeholders')
    expect(live).not.toMatch(/cfgSet\('guardBlacklist',\s*\{\s*placeholders/)
  })

  it('locks the auto-resume toggle when the install pins it', () => {
    // The supervisor answers `autoResumePinned` on its status endpoint; a pinned
    // value outranks this store, so an interactive toggle would silently no-op.
    expect(entry).toContain("'/dsh-maestro-supervisor-resume'")
    expect(entry).toMatch(/supervisorRpcCall/)
    expect(live).toContain("supervisorRpcCall('status'")
    expect(live).toContain('const autoResumePinned = supervisorStatus?.autoResumePinned === true')
    expect(live).toContain('disabled: autoResumePinned')
    // The row renders the EFFECTIVE value the plugin reports (store, env and
    // defaults folded together) whenever it answers — a fresh install's
    // documented default is ON, and a store-only read would wrongly show OFF.
    expect(live).toContain('const autoResumeChecked = typeof supervisorStatus?.autoResumeEnabled')
    expect(live).toContain('checked: autoResumeChecked')
    // An explicit write keeps that view in step until the next status fetch.
    expect(live).toMatch(/setSupervisorStatus\(\(prev: any\) => \(prev \? \{ \.\.\.prev, autoResumeEnabled/)
  })

  it('says the blacklist list does not gate live tool calls', () => {
    expect(live).toContain('do NOT gate any live tool call')
    expect(live).toContain('check-public-blacklist.mjs')
  })

  it('explains the supervisor interval/threshold rows belong to the standalone daemon', () => {
    expect(live).toContain('standalone dsh-web-supervisor daemon')
  })

  it('guard tab explains tiers, the locked tamper rule and the additive paths list', () => {
    const live = read('MaestroSettings.tsx')
    // Per-rule Default/Allow/Journal/Ask/Deny selector with the built-in tier
    // named, so a user can tell a default from a customization.
    expect(live).toContain('Default (')
    // guard.tamper is a structural floor: the selector offers no downgrade.
    expect(live).toContain('Locked: the guard never allows lowering this one.')
    // Extra paths add to the built-in list; the defaults stay put.
    expect(live).toContain('cannot be removed from here')
    // Journal knobs are boot-time: the tab must say a restart is required.
    expect(live).toContain('once at boot')
  })

  it('ToggleRow supports a disabled (locked) state', () => {
    expect(live).toMatch(/function ToggleRow\([^)]*disabled/)
    expect(live).toContain("'data-maestro-locked'")
    expect(live).toContain('aria-disabled')
  })
})
