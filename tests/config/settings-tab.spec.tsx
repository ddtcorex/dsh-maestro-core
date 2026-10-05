// @vitest-environment jsdom
/**
 * The Maestro settings section renders guard and supervisor controls from one
 * stateful tab component. The tab reads `error` while rendering and writes it
 * from every save handler, so a lost state declaration does not fail the
 * component's own tests — it fails at the first browser render, after the
 * plugin has already been installed and every local gate has passed.
 *
 * This spec renders the tab the way the shell does: with the RPC seam in place
 * and the host answering. A render that throws is the regression it pins; so is
 * a control that never appears, which is what the crash left behind.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import * as React from 'react'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MaestroSettingsTab } from '../../src/client/config/MaestroSettings.js'

const carrier = (value: unknown) => ({ ok: true, value })

/** The store read the tab issues on mount, keyed by domain. */
function configRpc(domain: string): unknown {
  if (domain === 'guard') return { enabled: true, rules: {}, journal: { enabled: true, retainDays: 30, retainFiles: 14 } }
  if (domain === 'guardBlacklist') return { patterns: ['example-project'] }
  if (domain === 'supervisor') return { intervalMs: 5000, downThreshold: 3 }
  return {}
}

function supervisorRpc(endpoint: string): unknown {
  if (endpoint === 'status') {
    return carrier({
      autoResumeEnabled: true,
      autoResumeWithin: 5,
      resumeCoreToolPolicy: 'warn',
      pinned: false,
      effective: { autoResumeEnabled: true, autoResumeWithin: 5 },
    })
  }
  return carrier({})
}

function makeProps() {
  return {
    configRpcCall: async (endpoint: string, payload: any) =>
      endpoint === 'get' ? carrier(configRpc(payload.domain)) : carrier({}),
    supervisorRpcCall: async (endpoint: string) => supervisorRpc(endpoint),
  }
}

describe('MaestroSettingsTab', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })
  afterEach(() => {
    cleanup()
  })

  it('renders its controls without throwing', async () => {
    // The crash under repair was `ReferenceError: error is not defined`, raised
    // while rendering — a tab that throws here mounted an empty panel in the
    // live Settings dialog and every gate stayed green.
    expect(() => render(<MaestroSettingsTab {...makeProps() as any} />)).not.toThrow()

    // The panel is only useful once its controls are actually in the document.
    await waitFor(() => {
      expect(screen.getByRole('tablist', { name: 'Maestro settings sections' })).toBeInTheDocument()
    })
  })

  it('shows the guard surface the section owns', async () => {
    render(<MaestroSettingsTab {...makeProps() as any} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Guard/ })).toBeInTheDocument()
    })
    // guard is the default sub-tab, and its blacklist editor is part of it.
    await waitFor(() => {
      expect(screen.getByText(/Blacklist patterns/)).toBeInTheDocument()
    })
  })
})