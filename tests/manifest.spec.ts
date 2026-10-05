/**
 * The manifest is what the harness reads before any code runs: the subpath
 * exports decide whether a row's `name` resolves at all, and `cordis.patch.yml`
 * decides which modules load. A typo in either is silent at build time and
 * fatal at boot, so both are pinned here.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(__dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const rows = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')

describe('core manifest', () => {
  it('declares the bin, the lib subpath, the store subpath and one client', () => {
    expect(pkg.bin['dsh-web-supervisor']).toBe('./lib/bin.js')
    expect(pkg.exports['./lib/*']).toBe('./lib/*')
    expect(pkg.exports['./store']).toBeTruthy()
    expect(pkg.exports['./client']).toBeTruthy()
    expect(pkg.dsh.client.platform).toBe('web')
    expect(pkg.dsh.client.inject).toEqual(
      expect.arrayContaining(['@deepseek-ai/dsh-client-connection', '@deepseek-ai/dsh-client-ui-slots']),
    )
  })

  it('declares types where tsc actually emits them', () => {
    // The host project emits declarations beside their js; only the client
    // project sets a declarationDir, so lib/types holds client types alone.
    const tsClient = JSON.parse(readFileSync(join(root, 'tsconfig.client.json'), 'utf8'))
    expect(pkg.exports['.'].types).toBe('./lib/index.d.ts')
    expect(pkg.exports['./store'].types).toBe('./lib/store/index.d.ts')
    expect(pkg.exports['./client'].types).toBe(
      `./${tsClient.compilerOptions.declarationDir}/index.d.ts`.replace(/^\.\//, './'),
    )
  })

  it('keeps rootDir src/host and has no dependency on config-lib', () => {
    const ts = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8'))
    expect(ts.compilerOptions.rootDir).toBe('src/host')
    expect(JSON.stringify(pkg.dependencies ?? {})).not.toContain('config-lib')
  })

  it('has the four rows with their ids and channels', () => {
    for (const id of ['maestro-supervisor', 'dsh-maestro-sync', 'dsh-maestro-guard', 'maestro-config']) {
      expect(rows).toContain(`id: ${id}`)
    }
    expect(rows).toContain('channel: /dsh-maestro-sync')
    expect(rows).toContain('channel: /dsh-maestro-guard')
    expect(rows).toMatch(/lib\/sync\/index\.js/)
    expect(rows).toMatch(/lib\/guard\/index\.js/)
    expect(rows).toMatch(/lib\/config\/index\.js/)
  })

  it('lists every absorbed module entry as a build artifact name', () => {
    expect(existsSync(join(root, 'src/host/sync/index.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/host/guard/index.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/host/config/index.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/host/store/index.ts'))).toBe(true)
  })

  it('points every row name at a path the exports map can resolve', () => {
    // A row `name` that the exports map does not admit is skipped at boot, so
    // the subpath pattern and the row names have to agree.
    expect(pkg.exports['./lib/*']).toBe('./lib/*')
    let absorbed = 0
    for (const match of rows.matchAll(/^\s+name: '(.+)'$/gm)) {
      const name = match[1]
      if (!name.startsWith('@ddtcorex/dsh-maestro-core/')) continue
      const subpath = name.slice('@ddtcorex/dsh-maestro-core/'.length)
      expect(subpath, name).toMatch(/^lib\/.+\.js$/)
      absorbed += 1
    }
    expect(absorbed).toBe(3)
  })

  it('composes one client entry that guards every module apply', () => {
    const entry = readFileSync(join(root, 'src/client/index.tsx'), 'utf8')
    expect(entry).toContain("from './auto-reload.js'")
    expect(entry).toContain("from './config/index.js'")
    expect(entry).toContain("from './sync/index.js'")
    // One loop, one try/catch around it: a module that throws on register must
    // not cost the remaining modules their registration.
    expect(entry.match(/\['[a-z-]+', apply[A-Za-z]+\]/g)?.length ?? 0).toBe(3)
    expect(entry).toMatch(/for \(const \[name, register\] of MODULES\)/)
    expect(entry).toMatch(/catch \(err\)/)
  })
})