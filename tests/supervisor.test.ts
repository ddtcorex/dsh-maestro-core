import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Supervisor, resumeViaRpc } from '../src/host/supervisor.js'

describe('supervisor', () => {
  it('posts a valid loopback RPC envelope and returns the resumed ids', async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body))
      return new Response(JSON.stringify({
        type: 'server-response',
        rpcId: request.rpcId,
        result: { ok: true, value: { resumed: ['proj/session-a'] } },
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await expect(resumeViaRpc(['proj/session-a'], fetch)).resolves.toEqual({ resumed: ['proj/session-a'] })
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:3080/dsh-maestro-supervisor-resume/resume',
      expect.objectContaining({ method: 'POST', headers: { 'content-type': 'application/json' } }),
    )
    expect(JSON.parse(String(fetch.mock.calls[0]![1].body))).toMatchObject({
      type: 'client-request', method: 'resume', payload: { ids: ['proj/session-a'] },
    })
  })

  it('reports a failed resume trigger instead of claiming auto-resume', async () => {
    const notify = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => ({ up: true, httpCode: 200 }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      notify,
      resumeSessions: async () => { throw new Error('loopback unavailable') },
    })

    await (s as any).attemptAutoResume(['proj/session-a'])
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('RESUME FAILED'))
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('auto-resuming'))
  })

  it('writes the restart outcome once the supervised boot is healthy', async () => {
    const writeOutcome = vi.fn()
    const s = new Supervisor({
      pollHealth: async () => ({ up: true, httpCode: 200 }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      writeOutcome,
      listenerPid: () => 22,
      getTime: () => 999,
    } as any)
    ;(s as any).awaitingHealthyBoot = true
    ;(s as any).pendingRestartRequest = { callerSessionId: 'proj/a', oldPid: 11 }
    await s.tick()
    expect(writeOutcome).toHaveBeenCalledWith('proj/a', {
      state: 'ok', oldPid: 11, newPid: 22, httpStatus: 200, swappedAt: 999,
    })
  })

  it('does not snapshot or report when healthy', async () => {
    const writeReport = vi.fn(async () => '/tmp/report.md')
    const notify = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => ({ up: true, httpCode: 200 }),
      writeReport,
      notify,
      intervalMs: 10,
    })
    await s.tick()
    expect(writeReport).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('restarts once when down (debounced)', async () => {
    const restartWeb = vi.fn(async () => {})
    const writeReport = vi.fn(async () => '/tmp/report.md')
    const s = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'ERR_MODULE_NOT_FOUND' }),
      writeReport,
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      debounceMs: 60000,
      downThreshold: 1, // this test is about debounce, not the consecutive-failure threshold
    })
    await s.tick()
    await s.tick() // second tick within debounce should not restart again
    expect(restartWeb).toHaveBeenCalledTimes(1)
    expect(writeReport).toHaveBeenCalled()
  })

  it('does not restart on a single transient down poll', async () => {
    // Regression: a lone fetch timeout / AbortError during a slow boot was
    // being treated as a confirmed crash on the very first bad poll, which
    // then re-triggered restartWeb() and its own transient errors — a
    // self-sustaining restart loop. Require consecutive confirmations.
    const restartWeb = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'This operation was aborted' }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 3,
    })
    await s.tick()
    await s.tick()
    expect(restartWeb).not.toHaveBeenCalled()
  })

  it('restarts once downThreshold consecutive down polls are seen', async () => {
    const restartWeb = vi.fn(async () => {})
    const notify = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'This operation was aborted' }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb,
      notify,
      intervalMs: 10,
      downThreshold: 3,
    })
    await s.tick()
    await s.tick()
    expect(restartWeb).not.toHaveBeenCalled()
    await s.tick()
    expect(restartWeb).toHaveBeenCalledTimes(1)
  })

  it('resets the consecutive-down count when health recovers between down polls', async () => {
    const states: Array<{ up: boolean; error?: string }> = [
      { up: false, error: 'aborted' },
      { up: false, error: 'aborted' },
      { up: true, httpCode: 200 } as any, // recovers before hitting the threshold
      { up: false, error: 'aborted' },
      { up: false, error: 'aborted' },
    ]
    const restartWeb = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => states.shift() as any,
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 3,
    })
    for (let i = 0; i < states.length; i++) await s.tick()
    expect(restartWeb).not.toHaveBeenCalled()
  })

  it('does not treat down as a crash while a planned restart is active', async () => {
    // Coordination with dsh-safe-web-update's restart-dsh-web.sh: an
    // intentional restart can hold the port down far longer than any
    // consecutive-down threshold tuned for a real crash. See
    // <workspace-root>/docs/specs/2026-09-13-supervisor-restart-resilience-design.md.
    const restartWeb = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'aborted' }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb,
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 1,
      isPlannedRestartActive: async () => true,
    })
    await s.tick()
    await s.tick()
    await s.tick()
    expect(restartWeb).not.toHaveBeenCalled()
    expect(restartWeb).not.toHaveBeenCalled()
  })

  it('resumes normal crash handling once the planned-restart marker is gone', async () => {
    let planned = true
    const restartWeb = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'aborted' }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 1,
      isPlannedRestartActive: async () => planned,
    })
    await s.tick()
    expect(restartWeb).not.toHaveBeenCalled()
    planned = false
    await s.tick()
    expect(restartWeb).toHaveBeenCalledTimes(1)
  })

  it('does not restart when already restarting', async () => {
    let resolvers: (() => void)[] = []
    const restartWeb = vi.fn(async () => new Promise<void>(r => resolvers.push(r)))
    const s = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'crash' }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 1,
    })
    const p1 = s.tick()
    const p2 = s.tick()
    await new Promise(r => setTimeout(r, 20))
    expect(restartWeb).toHaveBeenCalledTimes(1)
    resolvers.forEach(r => r())
    await p1; await p2
  })

  it('marker: restartWeb uses the boot budget as the marker TTL', async () => {
    const writes: string[] = []
    const s = new Supervisor({
      pollHealth: async () => ({ up: true, httpCode: 200 }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb: async () => { writes.push('restart') },
      notify: vi.fn(async () => {}),
      bootGraceMs: 180_000,
      // injected marker writer for test isolation — TTL follows bootGraceMs (D5)
      writePlannedRestart: ((ttl?: number) => { writes.push(`marker:${ttl}`) }) as any,
    } as any)
    await s.restartWeb()
    expect(writes[0]).toBe('marker:180000')
    expect(writes[1]).toBe('restart')
  })

  it('clears the suppression marker on the first healthy poll', async () => {
    const cleared = vi.fn()
    const s = new Supervisor({
      pollHealth: async () => ({ up: true, httpCode: 200 }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      checkPlannedRestart: () => true,
      clearPlannedRestart: cleared,
    } as any)
    await s.tick()
    expect(cleared).toHaveBeenCalledTimes(1)
  })

  it('marker: tick suppressed when planned restart active (no writeReport/restartWeb)', async () => {
    const writeReport = vi.fn(async () => '/tmp/report.md')
    const restartWeb = vi.fn(async () => {})
    const s = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'crash' }),
      writeReport,
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 1,
      checkPlannedRestart: () => true,
    } as any)
    await s.tick()
    await s.tick()
    await s.tick()
    expect(writeReport).not.toHaveBeenCalled()
    expect(restartWeb).not.toHaveBeenCalled()
  })

  it('marker: tick doubles downThreshold when suppressed', async () => {
    const restartWeb = vi.fn(async () => {})
    const writeReport = vi.fn(async () => '/tmp/report.md')
    // Phase 1: suppressed — downThreshold 3 doubled to 6, so 3 ticks should NOT trigger restart
    const sSuppressed = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'crash' }),
      writeReport,
      restartWeb,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 3,
      checkPlannedRestart: () => true,
    } as any)
    await sSuppressed.tick()
    await sSuppressed.tick()
    await sSuppressed.tick()
    expect(restartWeb).not.toHaveBeenCalled()
    // 6th tick still suppressed (marker active) — should never restart while suppressed
    await sSuppressed.tick()
    await sSuppressed.tick()
    await sSuppressed.tick()
    expect(restartWeb).not.toHaveBeenCalled()
    // Phase 2: not suppressed — same 3 threshold should restart after 3 downs
    const restartWeb2 = vi.fn(async () => {})
    const sNormal = new Supervisor({
      pollHealth: async () => ({ up: false, error: 'crash' }),
      writeReport: vi.fn(async () => '/tmp/report.md'),
      restartWeb: restartWeb2,
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      downThreshold: 3,
      checkPlannedRestart: () => false,
    } as any)
    await sNormal.tick()
    await sNormal.tick()
    expect(restartWeb2).not.toHaveBeenCalled()
    await sNormal.tick()
    expect(restartWeb2).toHaveBeenCalledTimes(1)
  })
})

describe('caller restart-request handling', () => {
  it('fires restartWeb exactly once after the grace when a caller marker is present', async () => {
    vi.useFakeTimers()
    const restartWeb = vi.fn(async () => {})
    const notify = vi.fn(async () => {})
    const req = { ts: Date.now(), ttl: 180_000, callerSessionId: 'proj/s-1', reason: 'plugin v2' }
    const supervisor = new Supervisor({
      pollHealth: async () => ({ up: false }),
      writeReport: async (o: any) => o.ts,
      restartWeb,
      notify,
      getTime: () => Date.now(),
      isPlannedRestartActive: async () => false,
      // Hermetic: never write the real ~/.dsh/.supervisor/planned-restart.json
      // (a live daemon and parallel test files contend on that path).
      writePlannedRestart: () => {},
      bootGraceMs: 180_000,
      readRestartRequest: () => req,
    } as any)
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/self-restart by session proj\/s-1/))
    supervisor.stop()
    vi.useRealTimers()
  })

  it('does nothing when the marker has no caller', async () => {
    vi.useFakeTimers()
    const restartWeb = vi.fn(async () => {})
    const supervisor = new Supervisor({
      pollHealth: async () => ({ up: false }),
      writeReport: async (o: any) => o.ts,
      restartWeb,
      notify: async () => {},
      getTime: () => Date.now(),
      writePlannedRestart: () => {},
      bootGraceMs: 180_000,
      readRestartRequest: () => undefined,
    } as any)
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).not.toHaveBeenCalled()
    supervisor.stop()
    vi.useRealTimers()
  })

  it('clears the suppression marker on the post-restart up-tick (held until boot proves healthy)', async () => {
    vi.useFakeTimers()
    const restartWeb = vi.fn(async () => {})
    const cleared = vi.fn()
    let up = false
    let marker: any = { ts: Date.now(), ttl: 180_000, callerSessionId: 'proj/s-1', reason: 'plugin v2' }
    const supervisor = new Supervisor({
      pollHealth: async () => ({ up }),
      writeReport: async (o: any) => o.ts,
      restartWeb,
      notify: async () => {},
      getTime: () => Date.now(),
      writePlannedRestart: () => {},
      bootGraceMs: 180_000,
      readRestartRequest: () => marker,
      clearPlannedRestart: cleared,
    } as any)
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).toHaveBeenCalledTimes(1)
    // The suppression marker must NOT be cleared before the restart boot
    // proves healthy — clearing early would drop crash suppression mid-boot.
    expect(cleared).not.toHaveBeenCalled()
    // Boot completes: the up-tick clears the pending marker/flag exactly once
    // and does not re-fire restartWeb.
    up = true
    marker = undefined
    await supervisor.tick()
    expect(cleared).toHaveBeenCalledTimes(1)
    expect(restartWeb).toHaveBeenCalledTimes(1)
    // Marker cleared + latch re-armed → a fresh request is handled again.
    marker = { ts: Date.now(), ttl: 180_000, callerSessionId: 'proj/s-2', reason: 'again' }
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).toHaveBeenCalledTimes(2)
    supervisor.stop()
    vi.useRealTimers()
  })

  it('keeps the single-flight latch when the up-tick marker clear fails', async () => {
    vi.useFakeTimers()
    const restartWeb = vi.fn(async () => {})
    let up = false
    const supervisor = new Supervisor({
      pollHealth: async () => ({ up }),
      writeReport: async (o: any) => o.ts,
      restartWeb,
      notify: async () => {},
      getTime: () => Date.now(),
      writePlannedRestart: () => {},
      bootGraceMs: 180_000,
      readRestartRequest: () => ({ ts: Date.now(), ttl: 180_000, callerSessionId: 'proj/s-1' }),
      clearPlannedRestart: () => { throw new Error('disk error') },
    } as any)
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).toHaveBeenCalledTimes(1)
    // Boot completes but the clear throws → the latch must stay set so the
    // still-present marker is never re-handled into a second restart.
    up = true
    await supervisor.tick()
    up = false
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).toHaveBeenCalledTimes(1)
    supervisor.stop()
    vi.useRealTimers()
  })

  it('does not re-fire restartWeb on a down tick within the restart debounce', async () => {
    vi.useFakeTimers()
    const restartWeb = vi.fn(async () => {})
    let up = false
    const supervisor = new Supervisor({
      pollHealth: async () => ({ up }),
      writeReport: async (o: any) => o.ts,
      restartWeb,
      notify: async () => {},
      getTime: () => Date.now(),
      writePlannedRestart: () => {},
      bootGraceMs: 180_000,
      readRestartRequest: () => ({ ts: Date.now(), ttl: 180_000, callerSessionId: 'proj/s-1' }),
      downThreshold: 1, // normally a single down tick would restart
    } as any)
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).toHaveBeenCalledTimes(1)
    // Still booting (down). The debounce set when the grace branch issued the
    // restart must hold: no racing second restart.
    await supervisor.tick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(restartWeb).toHaveBeenCalledTimes(1)
    supervisor.stop()
    vi.useRealTimers()
  })
})

describe('boot-settled counter gate', () => {
  function makeSupervisor(over: Record<string, unknown>) {
    return new Supervisor({
      writeReport: vi.fn(async () => '/tmp/report.md'),
      notify: vi.fn(async () => {}),
      intervalMs: 10,
      // Hermetic: never read the operator's real planned-restart marker.
      checkPlannedRestart: () => false,
      ...over,
    } as any)
  }

  it('never advances the degraded counter while the boot is unproven', async () => {
    const restartWeb = vi.fn(async () => {})
    const s = makeSupervisor({
      pollHealth: async () => ({ up: true, httpCode: 200, error: 'This operation was aborted', degraded: true, bootPhase: 'booting' }),
      restartWeb,
    })
    for (let i = 0; i < 8; i++) await s.tick()
    expect((s as any).consecutiveDegraded).toBe(0)
    expect((s as any).deps.writeReport).not.toHaveBeenCalled()
    expect(restartWeb).not.toHaveBeenCalled()
  })

  it('never advances the down counter on a weak failure while the boot is unproven', async () => {
    const restartWeb = vi.fn(async () => {})
    const s = makeSupervisor({
      pollHealth: async () => ({ up: false, error: 'This operation was aborted', bootPhase: 'booting' }),
      downThreshold: 1,
      restartWeb,
    })
    await s.tick()
    await s.tick()
    expect((s as any).consecutiveDown).toBe(0)
    expect(restartWeb).not.toHaveBeenCalled()
  })

  it('advances the down counter for a refused connection even while the boot is unproven', async () => {
    const s = makeSupervisor({
      pollHealth: async () => ({ up: false, error: 'connect ECONNREFUSED 127.0.0.1:3082', bootPhase: 'booting' }),
      downThreshold: 3,
    })
    await s.tick()
    await s.tick()
    expect((s as any).consecutiveDown).toBe(2)
  })

  it('restarts once the boot has settled and the threshold is reached', async () => {
    const restartWeb = vi.fn(async () => {})
    const s = makeSupervisor({
      pollHealth: async () => ({ up: false, error: 'This operation was aborted', bootPhase: 'settled' }),
      downThreshold: 3,
      restartWeb,
    })
    await s.tick()
    await s.tick()
    expect(restartWeb).not.toHaveBeenCalled()
    await s.tick()
    expect(restartWeb).toHaveBeenCalledTimes(1)
  })

  it('takes the boot grace from deps when injected', async () => {
    const s = makeSupervisor({ pollHealth: async () => ({ up: true }), bootGraceMs: 90_000 })
    await expect((s as any).getEffectiveBootGraceMs()).resolves.toBe(90_000)
  })
})
