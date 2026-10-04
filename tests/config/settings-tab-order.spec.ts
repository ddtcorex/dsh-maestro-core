import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The Maestro Settings tabs are registered by several npm packages, each with
// its own `settings.section`. The shell orders that slot by the numeric `order`
// alone, so two tabs sharing a number have NO defined relative order, which is
// how the Maestro tab and upstream's archived-sessions page (order 25) used to
// swap places between loads. Each package only inspects its own bundle, so a
// collision introduced in a sibling stays invisible to its own tests.
//
// This spec therefore asserts invariants over whichever sections can be read:
//   - core's own sections (`maestro`, `maestro-sync`) are ALWAYS read from this
//     repository;
//   - sibling plugin sources are read from MAESTRO_SIBLINGS_DIR (default: the
//     parent of this repository, where CI clones siblings and where the live
//     workspace keeps them). A sibling that is absent is skipped explicitly.

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const siblingsDir = process.env.MAESTRO_SIBLINGS_DIR ? resolve(process.env.MAESTRO_SIBLINGS_DIR) : resolve(repoRoot, '..')

/** The number a tab registers, as written in its own source; undefined when the source lacks the id. */
const orderOf = (source: string, id: string): number | undefined => {
  const block = new RegExp(`id:\\s*'${id}'[\\s\\S]{0,400}?order:\\s*([A-Za-z_$][\\w$]*|\\d+)`).exec(source)
  if (!block) return undefined
  const raw = block[1]
  if (/^\d+$/.test(raw)) return Number(raw)
  const constant = new RegExp(`const\\s+${raw}\\s*=\\s*(\\d+)`).exec(source)
  expect(constant, `order constant "${raw}" has no numeric literal in this file`).not.toBeNull()
  return Number(constant![1])
}

interface Found {
  id: string
  order: number
}

const CORE: Array<{ id: string; file: string }> = [
  { id: 'maestro', file: resolve(repoRoot, 'src/client/config/index.tsx') },
  { id: 'maestro-sync', file: resolve(repoRoot, 'src/client/sync/index.tsx') },
]

const SIBLINGS: Array<{ pkg: string; ids: string[] }> = [
  { pkg: 'dsh-maestro-jobs', ids: ['maestro-jobs'] },
  { pkg: 'dsh-maestro-gateway', ids: ['maestro-gateway'] },
  { pkg: 'dsh-maestro-remote', ids: ['maestro-remote'] },
  { pkg: 'dsh-maestro-review', ids: ['maestro-review'] },
  { pkg: 'dsh-maestro-notifier', ids: ['maestro-notifier'] },
]
const SUTUNAM_PKG = 'dsh-sutunam-kit'

const EXPECTED: Record<string, number> = {
  maestro: 26,
  'maestro-jobs': 27,
  'maestro-sync': 28,
  'maestro-gateway': 29,
  'maestro-remote': 31,
  'maestro-review': 32,
  'maestro-notifier': 33,
}

const siblingEntry = (pkg: string) => resolve(siblingsDir, pkg, 'src/client/index.tsx')

// Lazy loader: nothing is read at describe-body time.
const load = (): { maestro: Found[]; sutunamOrder: number | undefined } => {
  const maestro: Found[] = []
  for (const { id, file } of CORE) {
    const order = orderOf(readFileSync(file, 'utf8'), id)
    expect(order, `core section "${id}" must be declared in ${file}`).toBeDefined()
    maestro.push({ id, order: order! })
  }
  for (const { pkg, ids } of SIBLINGS) {
    const file = siblingEntry(pkg)
    if (!existsSync(file)) {
      console.info(`[settings-tab-order] skipped sibling ${pkg}: ${file} not found (MAESTRO_SIBLINGS_DIR=${siblingsDir})`)
      continue
    }
    const source = readFileSync(file, 'utf8')
    for (const id of ids) {
      const order = orderOf(source, id)
      if (order === undefined) {
        console.info(`[settings-tab-order] skipped ${id}: ${pkg} does not declare it yet`)
        continue
      }
      maestro.push({ id, order })
    }
  }
  let sutunamOrder: number | undefined
  const kit = siblingEntry(SUTUNAM_PKG)
  if (existsSync(kit)) sutunamOrder = orderOf(readFileSync(kit, 'utf8'), 'sutunam-kit')
  else console.info(`[settings-tab-order] skipped ${SUTUNAM_PKG}: ${kit} not found`)
  return { maestro, sutunamOrder }
}

describe('Maestro settings tab ordering', () => {
  it('declares core sections maestro=26 and maestro-sync=28 from this repository', () => {
    const { maestro } = load()
    expect(maestro.find((s) => s.id === 'maestro')).toMatchObject({ id: 'maestro', order: 26 })
    expect(maestro.find((s) => s.id === 'maestro-sync')).toMatchObject({ id: 'maestro-sync', order: 28 })
  })

  it('gives every Maestro tab a distinct order', () => {
    const { maestro, sutunamOrder } = load()
    const orders = [...maestro.map((s) => s.order), ...(sutunamOrder === undefined ? [] : [sutunamOrder])]
    expect(new Set(orders).size).toBe(orders.length)
  })

  it('starts the block above the archived-sessions page (order 25)', () => {
    for (const s of load().maestro) expect(s.order, `${s.id} must sort after archived-sessions`).toBeGreaterThan(25)
  })

  it('keeps Sutunam Kit behind the Maestro block and below the next upstream section', () => {
    const { maestro, sutunamOrder } = load()
    if (sutunamOrder !== undefined) {
      for (const s of maestro) expect(s.order, `${s.id} must render before sutunam-kit (${sutunamOrder})`).toBeLessThan(sutunamOrder)
      expect(sutunamOrder).toBeLessThan(100)
    }
    for (const s of maestro) expect(s.order, `${s.id} must stay below 100`).toBeLessThan(100)
  })

  it('matches the declared target order of every owner that is present', () => {
    for (const s of load().maestro) {
      if (EXPECTED[s.id] !== undefined) expect(s.order, `${s.id} declared order`).toBe(EXPECTED[s.id])
    }
  })
})
