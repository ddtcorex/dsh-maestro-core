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
