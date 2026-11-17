import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The shared settings field box, as it survives in the Maestro settings card.
 *
 * The host's `ConfigField` declaration is `padding`, `border`, `border-radius`,
 * `background`, `color` and `font`; `min-height: 44px` is the single Maestro
 * addition, and it exists because Maestro ships touch-primary surfaces where
 * AGENTS.md requires >=40px targets. Every value is a TOKEN, never a resolved
 * literal, so a host token change reaches us.
 *
 * The guard-tier `<select>` in MaestroSettings.tsx is an INLINE style object, not
 * a stylesheet rule — no selector could reach it without `!important` — so the
 * same declaration is asserted against the object literal instead.
 */

const settingsTsx = readFileSync(new URL('../src/client/config/MaestroSettings.tsx', import.meta.url), 'utf8')

/**
 * The guard-tier select's style object.
 *
 * Anchored on the select's own `h('select', …)` call: a bare `/style:\s*\{…\}/`
 * takes the FIRST match in the file, which is an unrelated control, so the
 * assertion would have been measuring the wrong element entirely.
 *
 * Matched with `\s*` between the call and the tag rather than a literal run of
 * spaces, so a reformat of the call site does not read as a missing control. It
 * still fails loudly if the select is gone, which is the property that matters.
 */
function guardSelectStyle(): string {
  const at = /h\(\s*'select',/.exec(settingsTsx)
  expect(at, 'the guard-tier select render').not.toBeNull()
  const selectIndex = at!.index
  const slice = settingsTsx.slice(selectIndex, selectIndex + 1200)
  const object = /style:\s*\{([^{}]*)\}/.exec(slice)?.[1]
  expect(object, 'the guard-tier select style object').toBeDefined()
  return object!
}

describe('shared settings field box', () => {
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

  it('leaves the inline select no fixed height, a stated 13px size and no hex', () => {
    // A fixed height would defeat the touch target; a hex would break the
    // token rule the standard exists to enforce.
    const style = guardSelectStyle()
    expect(style, 'a fixed height replaces the floor').not.toMatch(/(^|[^\w])height:/)
    // `font: inherit` alone resolves to the dialog's 16px body size here (this tab's
    // root sets none, the other sections set 13px on theirs), which made these
    // dropdowns the only 16px fields. The size must be stated, and AFTER the
    // shorthand: a longhand written before `font` is reset by it.
    expect(style).toMatch(/font:\s*'inherit',\s*fontSize:\s*13/)
    expect(style, 'a hardcoded hex replaces the token').not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(style, 'the retired platform surface token').not.toMatch(/bg-module-platform/)
  })
})
