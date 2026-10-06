import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'vitest'

/**
 * The SSH target's Save / Check-connection buttons must sit INLINE with the
 * field, not on a row of their own underneath it.
 *
 * A marker assertion proves nothing here: `div[data-sync-ssh] > input` and a
 * separate `div[data-sync-ssh-row] > button` were already true on the stacked
 * layout. These assertions read the declaration and the inline style instead.
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
 * The markup of the field row element itself.
 *
 * The slice must span the row's whole element INCLUDING its children. Slicing to
 * the first `</div>` returns only the opening tag plus the first child, so an
 * input relocated anywhere else in the row is invisible — the assertion reads as
 * armed while the old stacked layout passes it.
 */
function rowMarkup(): string {
  const start = panel.indexOf('<div data-sync-ssh-row=')
  assert.ok(start > -1, 'the field row wrapper is missing from the markup')
  // Walk braces from the row's opening tag to its matching close.
  let depth = 0
  for (let i = start; i < panel.length; i += 1) {
    if (panel[i] === '{') depth += 1
    else if (panel[i] === '}') depth -= 1
    if (panel.startsWith('/>', i) && depth === 1) {
      return panel.slice(start, i + 2)
    }
  }
  return panel.slice(start, panel.indexOf('</div>', start) + 6)
}

describe('the SSH field row', () => {
  it('lays the field row out as a row, not a column', () => {
    const body = ruleBody(css, '[data-sync-ssh-row]')
    assert.match(body, /display:\s*flex/)
    assert.match(
      body,
      /flex-direction:\s*row/,
      'the row must stay horizontal; a column would stack the buttons again',
    )
    assert.doesNotMatch(body, /flex-direction:\s*column/)
  })

  it('puts the input and the buttons in the SAME row element', () => {
    const markup = rowMarkup()
    assert.ok(
      /data-sync-ssh-input/.test(markup),
      'the input must live inside the row wrapper, beside the buttons',
    )
    assert.ok(
      /sync-check-connection/.test(markup),
      'the buttons must live inside the row wrapper',
    )
    // The input must precede the buttons so the field reads first.
    assert.ok(
      markup.indexOf('data-sync-ssh-input') < markup.indexOf('sync-check-connection'),
      'the field comes first on the row, the actions at the right',
    )
  })

  it('keeps the field flexible and the buttons fixed', () => {
    assert.match(
      ruleBody(css, '[data-sync-ssh-row] input'),
      /flex:\s*1/,
      'the input must take the free width',
    )
    assert.match(
      ruleBody(css, '[data-sync-ssh-row] input'),
      /min-width:\s*0/,
      'the input needs min-width:0 or it will not shrink on a narrow phone',
    )
    const buttons = ruleBody(css, '[data-sync-ssh-row] > [data-sync-btn]')
    assert.match(
      buttons,
      /flex:\s*none/,
      'the buttons must not grow, or they eat the field width',
    )
    assert.doesNotMatch(buttons, /flex:\s*1\s+1\s+0/, 'flex:1 1 0 was the full-width stacked row')
  })

  it('keeps the 48px touch floor on the buttons at the narrow breakpoint', () => {
    // Anchored on the rule inside the media block, not on the media body and
    // not with a loose `[\s\S]*?` bridge: a loose bridge matches the EARLIER
    // non-media `[data-sync-ssh-row] > [data-sync-btn]` rule, whose body is
    // `flex: 1 1 0`, and the assertion then passes on the wrong declaration.
    // `[^@]*?` cannot cross another `@media`, so the first such block wins.
    const narrow = /@media \(max-width: 640px\) \{[^@]*?\[data-sync-ssh-row\] > \[data-sync-btn\] \{([^}]*)\}/
      .exec(css)
    assert.ok(narrow, 'the 640px media block must still carry the button touch floor')
    assert.match(
      narrow[1],
      /min-height:\s*48px/,
      'the narrow-viewport touch floor must survive this change',
    )
    assert.match(narrow[1], /!important/, 'the floor relies on !important to beat the button rule')
  })

  it('lets the error message span the full row width', () => {
    // It must sit OUTSIDE the row wrapper so it keeps the full width instead of
    // being squeezed beside a button. "Outside" means the element is a SIBLING
    // of the row, so compare nesting rather than source order: the row may
    // legitimately come before it in the document.
    const rowStart = panel.indexOf('<div data-sync-ssh-row=')
    const rowEnd = panel.indexOf('</div>', panel.indexOf('sync-check-connection'))
    const errStart = panel.indexOf('data-sync-field-error=""')
    assert.ok(errStart > -1, 'the field error is missing')
    assert.ok(
      errStart > rowEnd,
      `the error message must sit after the row wrapper closes (row ends ${rowEnd}, error at ${errStart})`,
    )
    // And it must not have needed a grid hack any more: the container is a
    // flex column, where a child spans the full width by default.
    assert.doesNotMatch(
      panel,
      /gridColumn:\s*'1 \/ -1'/,
      'the grid span was dead — this container is a flex column, never a grid',
    )
  })

  it('keeps the actions disabled until the field holds something', () => {
    const markup = rowMarkup()
    assert.ok(
      /disabled=\{checking \|\| busy \|\| hostInput\.trim\(\)\.length === 0\}/.test(markup),
      'Save and Check connection must stay disabled while the field is empty',
    )
  })

  it('leaves the field box and its typography alone', () => {
    // A previous batch standardised this rule; the layout change must not touch it.
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
