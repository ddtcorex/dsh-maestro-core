import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeSkillProvider } from '../src/host/skill-provider.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const skillsDir = resolve(__dirname, '../skills')

describe('dsh-safe-restart skill provider', () => {
  it('exposes its own provider name (dsh-skill attributes via provider.name)', async () => {
    const provider = makeSkillProvider(skillsDir)
    expect((provider as any).name).toBe('maestro-supervisor')
  })

  it('lists exactly the dsh-safe-restart skill from the package skills dir', async () => {
    const as = (await makeSkillProvider(skillsDir).list({} as any)) as Array<{ name: string; path: string }>
    expect(as.map(s => s.name)).toEqual(['dsh-safe-restart'])
    expect(as[0].path).toBe(join(skillsDir, 'dsh-safe-restart', 'SKILL.md'))
  })

  it('resolves the skill body with its scripts resource base', async () => {
    const provider = makeSkillProvider(skillsDir)
    const [cand] = await provider.list({} as any)
    const skill = await provider.get(cand, {} as any)
    expect(skill?.content).toContain('## Purpose')
    expect(skill?.resourceBase).toEqual({ kind: 'directory', path: join(skillsDir, 'dsh-safe-restart') })
  })

  it('parses a CRLF SKILL.md exactly like the LF form', async () => {
    const root = await mkdtemp(join(tmpdir(), 'supervisor-crlf-'))
    try {
      const dir = join(root, 'dsh-safe-restart')
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, 'SKILL.md'), [
        '---',
        'name: dsh-safe-restart',
        'description: restarts dsh web safely',
        '---',
        '',
        '## Purpose',
        '',
        'body',
      ].join('\r\n'))

      const [cand] = await makeSkillProvider(root).list({} as any)
      expect(cand.description).toBe('restarts dsh web safely')
      expect(cand.description).not.toContain('\r')

      const skill = await makeSkillProvider(root).get(cand, {} as any)
      expect(skill?.content).toContain('## Purpose')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
