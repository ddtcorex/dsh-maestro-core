/**
 * This package is published to npm. A machine path, a private project name or a
 * token-shaped string that reaches a tracked file ships to the world, and the
 * diff will not show it: it looks like an ordinary example.
 *
 * `git grep` is the gate rather than a filesystem walk so the check matches
 * exactly what a clone and an `npm pack` would carry.
 */
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const root = join(__dirname, '..')
const PATTERN = '/home/kai|/Users/[a-z]|bebe9|NPM_TOKEN=|ghp_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{20,}'
const PATHS = ['src', 'tests', 'scripts', 'README.md', 'AGENTS.md', 'cordis.patch.yml']
// This file necessarily spells out what it forbids, so it is the one file the
// gate cannot scan. Nothing else in the tree may contain these literals.
const SELF = ':!tests/public-boundary.spec.ts'

/** git grep exits 1 when it matches nothing, which is the passing case here. */
function grepTracked(): string {
  try {
    return execFileSync('git', ['-C', root, 'grep', '-nE', PATTERN, '--', ...PATHS, SELF], {
      encoding: 'utf8',
    })
  } catch (err: any) {
    if (err?.status === 1) return ''
    throw err
  }
}

describe('public boundary', () => {
  it('has no machine path, private project name or secret-looking token in tracked source', () => {
    expect(grepTracked()).toBe('')
  })
})