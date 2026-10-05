/**
 * Consumers embed the store as one generated file, so the script that writes it
 * and the check that detects a stale or hand-edited copy both have to work
 * outside this repository. Every case runs the real CLI against a scratch
 * package directory.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const script = join(__dirname, '../scripts/vendor-store.mjs')
const sourceDir = join(__dirname, '../src/host/store')

async function loadScript() {
  return (await import(/* @vite-ignore */ script) as {
    verifyVendored: (file: string, sourceDir?: string) => { ok: boolean; reason?: string }
    vendorStore: (targetDir: string) => string
  })
}

function vendorInto(dir: string): string {
  execFileSync('node', [script, dir])
  return join(dir, 'src/host/vendor/store.ts')
}

describe('vendor-store', () => {
  it('writes a self-verifying vendored store', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consumer-'))
    const file = vendorInto(dir)
    expect(existsSync(file)).toBe(true)
    const [header, ...rest] = readFileSync(file, 'utf8').split('\n')
    const body = rest.join('\n')
    expect(header).toBe(`// vendored from dsh-maestro-core store, sha256:${createHash('sha256').update(body).digest('hex')}`)
    expect(body).toContain('export function onChange')
    expect(body).toContain('export async function readFlat')
    expect(body).not.toContain("from './index.js'")
  })

  it('keeps both source files in one module', () => {
    const dir = mkdtempSync(join(tmpdir(), 'consumer-'))
    const body = readFileSync(vendorInto(dir), 'utf8').split('\n').slice(1).join('\n')
    // index.ts and legacy.ts concatenated, with the cross-file import dropped
    // because its symbols are already in scope.
    expect(body).toContain('export function onChange')
    expect(body).toContain('export async function writeLegacyPatch')
    expect(body.match(/^import /gm)?.length ?? 0).toBeGreaterThan(0)
  })

  it('verifyVendored accepts a freshly generated copy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'consumer-'))
    const file = vendorInto(dir)
    const { verifyVendored } = await loadScript()
    expect(verifyVendored(file)).toEqual({ ok: true })
  })

  it('verifyVendored rejects a hand-edited copy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'consumer-'))
    const file = vendorInto(dir)
    const { verifyVendored } = await loadScript()
    writeFileSync(file, readFileSync(file, 'utf8') + '\n// edited')
    expect(verifyVendored(file).ok).toBe(false)
  })

  it('compares with a source directory when one is given', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'consumer-'))
    const file = vendorInto(dir)
    const { verifyVendored } = await loadScript()
    expect(verifyVendored(file, sourceDir)).toEqual({ ok: true })
  })

  it('reports drift when the source moved on but the copy did not', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'consumer-'))
    const file = vendorInto(dir)
    const stale = mkdtempSync(join(tmpdir(), 'stale-'))
    writeFileSync(join(stale, 'index.ts'), '// a newer core store\nexport const marker = 1\n')
    writeFileSync(join(stale, 'legacy.ts'), "import { load } from './index.js'\nexport const legacy = 1\n")
    const { verifyVendored } = await loadScript()
    const verdict = verifyVendored(file, stale)
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toMatch(/differs from the core source/)
  })

  it('is idempotent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'consumer-'))
    const file = vendorInto(dir)
    const first = readFileSync(file, 'utf8')
    const { vendorStore } = await loadScript()
    vendorStore(dir)
    expect(readFileSync(file, 'utf8')).toBe(first)
  })
})