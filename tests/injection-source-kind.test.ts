import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SUPERVISOR_SOURCE_KIND } from '../src/host/source.js'
import { warnCoreToolLoss } from '../src/host/resume-tools.js'

// Messages this plugin injects into a session are machine-initiated. Claiming
// `kind: 'user'` made them indistinguishable from a human prompt — including to
// dsh-maestro-memory's write guard, which documents that plugin-initiated turns
// carry no per-turn write duty and can only honour that if the producer says so.
// A bare 'plugin' is not an option: session format v4 rejects it outright.
describe('supervisor message attribution', () => {
  it('has a producer-owned kind and never claims a human prompt', () => {
    expect(SUPERVISOR_SOURCE_KIND).toBe('plugin:@ddtcorex/dsh-maestro-supervisor')
    expect(SUPERVISOR_SOURCE_KIND).not.toBe('user')
    expect(SUPERVISOR_SOURCE_KIND).not.toBe('plugin')

    for (const file of ['plugin.ts', 'resume-tools.ts']) {
      const src = readFileSync(new URL(`../src/host/${file}`, import.meta.url), 'utf8')
      expect(src, `${file} must not claim a human prompt`).not.toMatch(/source: \{ kind: 'user' \}/)
      expect(src, `${file} must reference the shared constant`).toMatch(/SUPERVISOR_SOURCE_KIND/)
    }
  })

  it('records the delivery path that cannot carry a kind', () => {
    // `promptOwnedSession` goes through sessionController.prompt, which
    // hardcodes kind 'user' and takes no source field — so that recovery turn
    // still looks human to consumers. The limitation is documented at the call
    // site and in the constant's own doc comment; this case fails if someone
    // deletes the record and leaves the earlier claim ("every injection is
    // attributed") standing unchecked.
    const source = readFileSync(new URL('../src/host/source.ts', import.meta.url), 'utf8')
    expect(source).toMatch(/promptOwnedSession/)
    const plugin = readFileSync(new URL('../src/host/plugin.ts', import.meta.url), 'utf8')
    expect(plugin).toMatch(/promptOwnedSession[\s\S]{0,400}kind: 'user'/)
  })

  it('sends the tool-inventory message with the plugin kind', async () => {
    const sent: any[] = []
    const ctx: any = {
      get: (name: string) => (name === 'agents'
        ? { get: () => ({ followup: (m: any) => { sent.push(m) } }) }
        : undefined),
      tools: { schemas: () => [{ name: 'bash' }] },
    }

    await warnCoreToolLoss(
      ctx,
      'session-x',
      undefined,
      { missing: ['bash'], available: [] } as any,
      'warn',
      { notify: async () => {} },
    )

    expect(sent).toHaveLength(1)
    expect(sent[0].source.kind).toBe(SUPERVISOR_SOURCE_KIND)
  })
})
