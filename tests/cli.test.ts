import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

describe('cli', () => {
  it('shows help', () => {
    const out = execSync('node lib/bin.js --help', { encoding: 'utf-8' })
    expect(out).toContain('daemon')
    expect(out).toContain('status')
  })
  it('status runs without crash', () => {
    const out = execSync('node lib/bin.js status 2>&1 || true', { encoding: 'utf-8', timeout: 20000 })
    expect(out).toContain('up:')
  }, 20000)
})

describe('cli help text', () => {
  it('lists only the commands the CLI implements', () => {
    const out = execSync('node lib/bin.js --help', { encoding: 'utf-8' })
    for (const cmd of ['daemon', 'status', 'resume [--within <dur>]', 'boot-guard acquire|release --pid <pid>']) {
      expect(out).toContain(cmd)
    }
    expect(out).not.toMatch(/\blogs\b/)
    expect(out).not.toMatch(/rollback/)
  })
})
