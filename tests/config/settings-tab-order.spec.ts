import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The Maestro Settings tabs live in four separate npm packages, each
// registering its own `settings.section`. The shell orders that slot by the
// numeric `order` alone, so two tabs sharing a number have NO defined relative
// order — which is exactly how the Maestro tab and upstream's archived-sessions
// page (order 25) used to swap places between loads. Nothing else in the suite
// can see this: each package only ever inspects its own bundle, so a collision
// introduced in a sibling package stays invisible.
//
// The fix keeps the block above 25 and below 100, with four distinct numbers.
// This spec reads the sibling sources directly — they are separate repos on
// disk, not dependencies of this package.

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagesDir = resolve(packageRoot, '..')
const readClientEntry = (pkg: string) => readFileSync(resolve(packagesDir, pkg, 'src/client/index.tsx'), 'utf8')

// CI and the pre-push rehearse sandbox check out ONLY the siblings declared in
// ci.yml (`sibling-repos`) — the other Maestro packages are absent there, so
// this file's cross-package read has nothing to read. Skip the whole block
// instead of failing: the invariant is checked in any complete workspace
// checkout (local dev), which is where a same-batch order change is made.
const siblingEntries = [
  'dsh-maestro-jobs',
  'dsh-maestro-sync',
  'dsh-maestro-gateway',
].map((pkg) => resolve(packagesDir, pkg, 'src/client/index.tsx'))
const sutunamEntry = resolve(packagesDir, '..', 'dsh-sutunam-kit', 'src/client/index.tsx')
const siblingsPresent = [...siblingEntries, sutunamEntry].every((f) => existsSync(f))

/** The number a tab registers, as written in its own source. */
const orderOf = (source: string, id: string): number => {
  // Match the registration block for this exact id, then its order field.
  const block = new RegExp(`id:\\s*'${id}'[\\s\\S]{0,400}?order:\\s*([A-Za-z_$][\\w$]*|\\d+)`).exec(source)
  expect(block, `no settings.section registration found for id "${id}"`).not.toBeNull()
  const raw = block![1]
  if (/^\d+$/.test(raw)) return Number(raw)
  // A named constant: resolve its literal from the same file.
  const constant = new RegExp(`const\\s+${raw}\\s*=\\s*(\\d+)`).exec(source)
  expect(constant, `order constant "${raw}" has no numeric literal in this file`).not.toBeNull()
  return Number(constant![1])
}

describe.skipIf(!siblingsPresent)('Maestro settings tab ordering', () => {
  // NOTE: the reads below are lazy (inside a loader called per test), not at
  // describe-body time. Vitest still executes a skipped suite's body during
  // collection, so an eager read would throw ENOENT in CI/rehearse instead of
  // skipping — exactly the failure this skip exists to avoid.
  const loadOrders = (): Record<'maestro' | 'maestro-jobs' | 'maestro-sync' | 'maestro-gateway', number> => {
    const entries = {
      maestro: readClientEntry('dsh-maestro-config'),
      'maestro-jobs': readClientEntry('dsh-maestro-jobs'),
      'maestro-sync': readClientEntry('dsh-maestro-sync'),
      'maestro-gateway': readClientEntry('dsh-maestro-gateway'),
    }
    return Object.fromEntries(
      Object.entries(entries).map(([id, source]) => [id, orderOf(source, id)]),
    ) as Record<'maestro' | 'maestro-jobs' | 'maestro-sync' | 'maestro-gateway', number>
  }

  it('gives every Maestro tab a distinct order', () => {
    // A duplicate is the defect itself, not a cosmetic detail: equal values
    // leave the rendered sequence up to the sort implementation.
    const values = Object.values(loadOrders())
    expect(new Set(values).size).toBe(values.length)
  })

  it('starts the block above the archived-sessions page', () => {
    // 25 belongs to upstream's ui-settings-unarchive-sessions. Staying strictly
    // above it is what puts every Maestro tab after "Archived sessions".
    for (const [id, order] of Object.entries(loadOrders())) {
      expect(order, `${id} must sort after archived-sessions (order 25)`).toBeGreaterThan(25)
    }
  })

  it('keeps the block contiguous and ordered Maestro-first', () => {
    // One contiguous run directly after the archived-sessions page (25), with
    // the private Sutunam Kit tab sitting last behind it — the operator's
    // explicit layout, so the Maestro rows never interleave with anything.
    const sorted = Object.entries(loadOrders()).sort((a, b) => a[1] - b[1])
    const values = sorted.map(([, order]) => order)
    expect(values).toEqual([26, 27, 28, 29])
    expect(sorted.map(([id]) => id)).toEqual(['maestro', 'maestro-jobs', 'maestro-sync', 'maestro-gateway'])
  })

  it('leaves Sutunam Kit last behind the whole Maestro run', () => {
    // The Sutunam Kit tab must render after every Maestro tab and share no
    // number with one: equal numbers leave the relative order undefined, so
    // this pins the exclusion from the other side. Whatever either side
    // chooses in the future, a Maestro tab may never tie or pass Sutunam.
    const sutunam = readFileSync(resolve(packagesDir, '..', 'dsh-sutunam-kit', 'src/client/index.tsx'), 'utf8')
    const sutunamOrder = orderOf(sutunam, 'sutunam-kit')
    for (const [id, order] of Object.entries(loadOrders())) {
      expect(order, `${id} must render before sutunam-kit (${sutunamOrder})`).toBeLessThan(sutunamOrder)
    }
  })

  it('stays below the next upstream section so the block cannot drift right', () => {
    for (const [id, order] of Object.entries(loadOrders())) {
      expect(order, `${id} must leave room below later upstream sections`).toBeLessThan(100)
    }
  })
})
