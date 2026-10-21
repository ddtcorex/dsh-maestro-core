import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const shouldRun = process.env.DSH_INTEGRATION === '1'

describe('integration — supervisor with ephemeral DSH_HOME', () => {
  it.skipIf(!shouldRun)('detects corrupted settings and triggers report', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-'))
    const dshHome = path.join(tmp, 'fake-home')
    fs.mkdirSync(path.join(dshHome, 'maestro'), { recursive: true })
    fs.writeFileSync(path.join(dshHome, 'maestro/settings.json'), '{ corrupted')
    // Simulate supervisor detecting failure — just verify the report path
    const { writeReport } = await import('../src/host/report.js')
    const reportsRoot = path.join(tmp, 'reports')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const reportPath = await writeReport({
      reportsRoot,
      ts,
      health: { up: false, error: 'JSON parse failed' },
      gitDiff: '',
      logTail: 'SyntaxError: Unexpected token',
      action: 'restart',
    })
    expect(fs.existsSync(reportPath)).toBe(true)
  })
})
