import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

/**
 * The SSH target's Save / Check-connection buttons sit on a row of their OWN,
 * BELOW the field.
 *
 * This is a deliberate product decision, taken by the human on 2026-10-06 after
 * an earlier commit in this same batch moved them inline with the field. That
 * earlier layout is REVERTED here: the field keeps the full column width and the
 * actions span the row beneath it.
 *
 * The assertions below read the STRUCTURE, never a marker. Both layouts contain
 * `div[data-sync-ssh] > input` and `div[data-sync-ssh-row] > button`, so a marker
 * assertion passes on either one and proves nothing.
 *
 * Note this file's assertions are the OPPOSITE of what the reverted commit's own
 * test asserted. That test was deleted on purpose — it encoded a decision the
 * human has overruled — and its replacement states the new decision instead.
 */
const css = readFileSync(new URL('../src/client/sync/index.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
const panel = readFileSync(new URL('../src/client/sync/SyncPanel.tsx', import.meta.url), 'utf8')

/**
 * The declaration body of the first rule whose selector list contains
 * `selector` as a whole comma-separated part.
 *
 * `selector` is matched LITERALLY (escaped), not pasted into a character class:
 * a combinator like `[data-sync-ssh-row] > [data-sync-btn]` contains `]` and
 * `[`, which inside `[...]` means "range out of order".
 */
function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`([^{}]*${escaped}[^{}]*)\\{([^}]*)\\}`, 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(source)) !== null) {
    if (match[1].split(',').some((part) => part.trim().endsWith(selector))) return match[2]
  }
  return ''
}

/**
 * The markup of the element whose opening tag starts with `openTag`, cut at its
 * own matching `</div>` by counting `<div` against `</div>`.
 *
 * Counting tags, not braces or the first `</div>`: the first close belongs to a
 * child, and brace-walking ran on to the end of the file, so a slice could
 * swallow the connection banner and an assertion could pass or fail for the wrong
 * region. Every element read here is a `<div>` with children, so nesting depth of
 * `<div` / `</div>` is the whole question.
 */
function elementMarkup(openTag: string): string {
  const start = panel.indexOf(openTag)
  assert.ok(start > -1, `${openTag} is missing from the markup`)
  const tag = /<div\b|<\/div>/g
  tag.lastIndex = start
  let depth = 0
  for (let m = tag.exec(panel); m !== null; m = tag.exec(panel)) {
    depth += m[0] === '</div>' ? -1 : 1
    if (depth === 0) return panel.slice(start, m.index + m[0].length)
  }
  throw new Error(`${openTag} has no matching </div>`)
}

const sshBlockMarkup = (): string => elementMarkup('<div data-sync-ssh=""')
const rowMarkup = (): string => elementMarkup('<div data-sync-ssh-row=')

describe('the SSH field block', () => {
  it('cuts each slice at its own closing tag, not at the end of the file', () => {
    // The structure assertions below read these slices; a slice that runs on into
    // the connection banner would let them fail or pass for the wrong region.
    const block = sshBlockMarkup()
    assert.doesNotMatch(block, /data-sync-conn/, 'the SSH block must stop before the connection banner')
    assert.match(block, /data-sync-ssh-src/, 'the SSH block must still contain its source line')
    const row = rowMarkup()
    assert.doesNotMatch(row, /data-sync-ssh-src/, 'the button row must stop before the source line')
    assert.match(row, /sync-save-host/, 'the button row must still contain its buttons')
  })

  it('keeps the field OUTSIDE the button row', () => {
    // The decision being pinned: the input is a SIBLING of the button row, not
    // a child of it. Read from the row's own subtree — if the input moved back
    // inside, this slice would contain it and the assertion fails.
    const row = rowMarkup()
    assert.ok(
      /sync-check-connection/.test(row),
      'the buttons must live inside the row wrapper',
    )
    assert.doesNotMatch(
      row,
      /data-sync-ssh-input/,
      'the field must NOT be inside the button row — it is a sibling above it',
    )
  })

  it('lists the field before the button row among the block children', () => {
    const block = sshBlockMarkup()
    const inputAt = block.indexOf('data-sync-ssh-input')
    const rowAt = block.indexOf('data-sync-ssh-row=')
    assert.ok(inputAt > -1, 'the SSH field is missing')
    assert.ok(rowAt > -1, 'the button row is missing')
    assert.ok(
      inputAt < rowAt,
      `the field must come before the button row in the block (input at ${inputAt}, row at ${rowAt})`,
    )
  })

  it('orders the block: field, then error, then button row, then source line', () => {
    // Order inside the block is the structure: the field and the error come
    // BEFORE the row opens, so neither can be a child of it.
    const block = sshBlockMarkup()
    const at = (needle: string): number => {
      const i = block.indexOf(needle)
      assert.ok(i > -1, `${needle} is missing from the SSH block`)
      return i
    }
    const input = at('data-sync-ssh-input')
    const error = at('data-sync-field-error=""')
    const row = at('<div data-sync-ssh-row=')
    const src = at('data-sync-ssh-src=""')
    assert.ok(input < error && error < row && row < src, `unexpected order: ${[input, error, row, src]}`)
  })

  it('lets the buttons span their own row', () => {
    // The stacked layout is what the human asked to restore, so the buttons take
    // the free width of their row instead of sitting at the right edge.
    const buttons = ruleBody(css, '[data-sync-ssh-row] > [data-sync-btn]')
    assert.match(buttons, /flex:\s*1\s+1\s+0/, 'the buttons fill the width of their own row')
    assert.doesNotMatch(
      buttons,
      /flex:\s*none/,
      'flex:none is the inline layout the human overruled',
    )
  })

  it('does not treat the input as a row child', () => {
    // The inline layout needed `input { flex: 1 1 auto; min-width: 0 }` to sit it
    // beside the buttons. With the field back in its own block child, that rule
    // is dead and would mislead the next reader.
    assert.equal(
      ruleBody(css, '[data-sync-ssh-row] input'),
      '',
      'no input styling inside the button row — the field is not a row child',
    )
  })

  it('matches the button height to the field height at the narrow breakpoint', () => {
    // Anchored on the rule inside the media block, not on the media body and not
    // with a loose `[\s\S]*?` bridge: a loose bridge matches the EARLIER non-media
    // rule, whose body is `flex: 1 1 0`, and the assertion then passes on the
    // wrong declaration. `[^@]*?` cannot cross another `@media`.
    const narrow = /@media \(max-width: 640px\) \{[^@]*?\[data-sync-ssh-row\] > \[data-sync-btn\] \{([^}]*)\}/
      .exec(css)
    assert.ok(narrow, 'the 640px media block must still carry the button touch floor')
    // Compared to the FIELD rule rather than hardcoding 44 twice: a later change
    // to the shared field box must fail here instead of silently desyncing the
    // buttons again (they measured 48 against a 44 field before this).
    const fieldHeight = /min-height:\s*(\d+px)/.exec(ruleBody(css, '[data-sync-ssh-input]'))?.[1]
    assert.ok(fieldHeight, 'the field rule must declare a min-height')
    assert.match(
      narrow[1],
      new RegExp(`min-height:\\s*${fieldHeight}`),
      `the narrow-viewport button height must equal the field height (${fieldHeight})`,
    )
    assert.match(narrow[1], /!important/, 'the floor relies on !important to beat the button rule')
  })

  it('keeps the error message out of the button row', () => {
    const row = rowMarkup()
    assert.doesNotMatch(row, /data-sync-field-error/, 'the error must stay a sibling of the row')
    assert.doesNotMatch(
      panel,
      /gridColumn:\s*'1 \/ -1'/,
      'the container is a flex column; a grid span there is dead weight',
    )
  })

  it('keeps the field on a whole pixel under its label', () => {
    // An 11px label inheriting the root's 1.5 line-height is 16.5px tall, which put
    // the field on y=418.5 at 390px; a 0.5px hairline on a half pixel can lose its
    // top edge on iOS. The label states a whole-pixel line-height.
    assert.match(ruleBody(css, '[data-sync-ssh-label]'), /line-height:\s*\d+px/)
  })

  it('keeps the actions disabled until the field holds something', () => {
    assert.ok(
      /disabled=\{checking \|\| busy \|\| hostInput\.trim\(\)\.length === 0\}/.test(panel),
      'Save and Check connection must stay disabled while the field is empty',
    )
  })

  it('leaves the field box and its typography alone', () => {
    // A previous batch standardised this rule; a layout change must not touch it.
    const field = ruleBody(css, '[data-sync-ssh-input]')
    assert.match(field, /border-radius:\s*var\(--dsw-radius-md\)/)
    assert.match(field, /padding:\s*6px 12px/)
    assert.match(field, /min-height:\s*44px/)
    assert.match(
      field,
      /font-family:\s*ui-monospace/,
      'the SSH field is monospace by design and must stay so',
    )
  })
})
