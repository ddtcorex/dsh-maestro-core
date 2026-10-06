import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The shared settings field box — the host's `ConfigField` declaration copied
 * verbatim, plus one Maestro value.
 *
 * `padding`, `border`, `border-radius`, `background`, `color` and `font` are the
 * HOST's, not ours: `min-height: 44px` is the single Maestro addition, and it
 * exists because Maestro ships touch-primary surfaces where AGENTS.md requires
 * >=40px targets. Every value is a TOKEN, never a resolved literal, so a host
 * token change reaches us.
 *
 * The guard-tier `<select>` in MaestroSettings.tsx is an INLINE style object, not
 * a stylesheet rule — no selector could reach it without `!important` — so the
 * same declaration is asserted against the object literal instead.
 */

const syncCss = readFileSync(new URL('../src/client/sync/index.tsx', import.meta.url), 'utf8')
const settingsTsx = readFileSync(new URL('../src/client/config/MaestroSettings.tsx', import.meta.url), 'utf8')

/** Strip comments so prose above a rule can never satisfy a selector assertion. */
const css = syncCss.replace(/\/\*[\s\S]*?\*\//g, '')

/** The declaration body of the rule whose selector matches `selector`. */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}(?![\\w-])[^{}]*\\{([^{}]*)\\}`).exec(source)
  if (match === null) throw new Error(`no rule for ${selector} in the stylesheet`)
  return match[1]
}

/**
 * The guard-tier select's style object.
 *
 * Anchored on the select's own `h('select', …)` call: a bare `/style:\s*\{…\}/`
 * takes the FIRST match in the file, which is an unrelated control, so the
 * assertion would have been measuring the wrong element entirely.
 */
function guardSelectStyle(): string {
  const selectIndex = settingsTsx.indexOf("h(\n                  'select',")
  expect(selectIndex, 'the guard-tier select render').toBeGreaterThan(-1)
  const slice = settingsTsx.slice(selectIndex, selectIndex + 1200)
  const object = /style:\s*\{([^{}]*)\}/.exec(slice)?.[1]
  expect(object, 'the guard-tier select style object').toBeDefined()
  return object!
}

describe('shared settings field box', () => {
  it('gives the SSH sync field the shared box', () => {
    const body = ruleBody(css, '[data-sync-ssh-input]')
    expect(body).toMatch(/padding:\s*6px 12px/)
    expect(body).toMatch(/border:\s*0\.5px solid var\(--dsw-alias-border-l4\)/)
    expect(body).toMatch(/border-radius:\s*var\(--dsw-radius-md\)/)
    expect(body).toMatch(/background:\s*var\(--dsw-alias-bg-layer-3\)/)
    expect(body).toMatch(/color:\s*var\(--dsw-alias-label-primary\)/)
    expect(body).toMatch(/font:\s*inherit/)
    expect(body).toMatch(/min-height:\s*44px/)
  })

  it('gives the R2 field the shared box', () => {
    const body = ruleBody(css, '[data-r2-field-input]')
    expect(body).toMatch(/padding:\s*6px 12px/)
    expect(body).toMatch(/border:\s*0\.5px solid var\(--dsw-alias-border-l4\)/)
    expect(body).toMatch(/border-radius:\s*var\(--dsw-radius-md\)/)
    expect(body).toMatch(/background:\s*var\(--dsw-alias-bg-layer-3\)/)
    expect(body).toMatch(/color:\s*var\(--dsw-alias-label-primary\)/)
    expect(body).toMatch(/font:\s*inherit/)
    expect(body).toMatch(/min-height:\s*44px/)
  })

  it('keeps the SSH field monospaced, which is not part of the box', () => {
    // An SSH target reads as a terminal field; the standard box must not flatten
    // it to the inherited UI face.
    expect(ruleBody(css, '[data-sync-ssh-input]')).toMatch(
      /font-family:\s*ui-monospace,\s*SFMono-Regular,\s*Menlo,\s*monospace/,
    )
  })

  it('keeps neither field selector sweeping in a checkbox', () => {
    // A bare `input` in the selector would hand a 16px checkbox a 44px box.
    for (const selector of ['[data-sync-ssh-input]', '[data-r2-field-input]']) {
      const selectorText = new RegExp(
        `(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\w-])([^{}]*)\\{`,
      ).exec(css)
      expect(selectorText, `no rule for ${selector}`).not.toBeNull()
      const tail = selectorText![2]
      expect(tail, `${selector} selects a checkbox`).not.toMatch(/input\s*\[/)
      expect(tail, `${selector} selects a checkbox`).not.toMatch(/checkbox/i)
      expect(tail, `${selector} selects a checkbox`).not.toMatch(/data-[\w-]*check/i)
    }
  })

  it('gives the inline guard-tier select the shared box', () => {
    // This select is an inline style object; a stylesheet could not reach it.
    const style = guardSelectStyle()
    expect(style).toMatch(/minHeight:\s*44/)
    expect(style).toMatch(/padding:\s*'6px 12px'/)
    expect(style).toMatch(/border:\s*'0\.5px solid var\(--dsw-alias-border-l4\)'/)
    expect(style).toMatch(/borderRadius:\s*'var\(--dsw-radius-md\)/)
    expect(style).toMatch(/background:\s*t\.bgLayer3/)
    expect(style).toMatch(/color:\s*t\.labelPrimary/)
    expect(style).toMatch(/font:\s*'inherit'/)
  })

  it('leaves the inline select no fixed height, no literal size and no hex', () => {
    // A fixed height would defeat the touch target; a hex would break the
    // token rule the standard exists to enforce.
    const style = guardSelectStyle()
    expect(style, 'a fixed height replaces the floor').not.toMatch(/(^|[^\w])height:/)
    expect(style, 'a literal font size overrides font:inherit').not.toMatch(/fontSize:/)
    expect(style, 'a hardcoded hex replaces the token').not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(style, 'the retired platform surface token').not.toMatch(/bg-module-platform/)
  })

  it('leaves both iOS 16px field floors exactly as they were', () => {
    // Asserted UNCHANGED, not absent: this repo's floor block already lists
    // `select`, matching the host's own guard scope. A test written to demand
    // the absence of `select` would "fix" an exclusion the product has.
    const blocks = css.match(
      /html\[data-mobile-nav-ios\][^{}]*\{[^{}]*font-size:\s*16px\s*!important;?[^{}]*\}/g,
    ) ?? []
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatch(/\[data-sync-root\] input:not\(#dsh-field-floor-opt-out\)/)
    expect(blocks[0]).toMatch(/\[data-sync-root\] textarea:not\(#dsh-field-floor-opt-out\)/)
    expect(blocks[0]).toMatch(/\[data-sync-root\] select:not\(#dsh-field-floor-opt-out\)/)
    expect(blocks[0]).toMatch(/font-size:\s*16px\s*!important/)
  })

  it('keeps the field rules inside their existing media context', () => {
    // Both field rules sit outside the iOS floor's `@media`, so that block — not
    // them — decides when the 16px hold applies.
    const floorIndex = css.indexOf('html[data-mobile-nav-ios]')
    const sshIndex = css.indexOf('[data-sync-ssh-input]')
    const r2Index = css.indexOf('[data-r2-field-input]')
    expect(floorIndex).toBeGreaterThan(-1)
    expect(sshIndex).toBeGreaterThan(-1)
    expect(r2Index).toBeGreaterThan(-1)
    expect(sshIndex).toBeLessThan(floorIndex)
    expect(r2Index).toBeLessThan(floorIndex)
  })
})