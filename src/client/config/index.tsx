import React from 'react'

const RPC_CHANNEL = '/dsh-maestro-config'

function useRpc(ctx: any) {
  return React.useCallback(
    (endpoint: string, payload: unknown) => {
      const conn = (ctx as any).connection ?? (ctx as any).get?.('connection')
      if (!conn?.rpc?.call) return Promise.reject(new Error('RPC not available'))
      return conn.rpc
        .call(RPC_CHANNEL, endpoint, payload)
        .then((result: any) => {
          if (result?.ok === true) return result.value
          const message =
            typeof result?.error?.message === 'string' ? result.error.message : 'RPC request failed'
          throw new Error(message)
        })
    },
    [ctx],
  )
}

type Draft = Record<string, string | number | boolean>

function isEditablePrimitive(v: unknown): v is string | number | boolean {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

/** One settings page: pick a domain, edit its primitive keys, save as a merge patch. */
function MaestroConfigSection({ ctx }: { ctx: any }): React.ReactElement {
  const rpc = useRpc(ctx)
  const [domains, setDomains] = React.useState<string[]>([])
  const [selected, setSelected] = React.useState<string>('')
  const [draft, setDraft] = React.useState<Draft>({})
  const [nestedKeys, setNestedKeys] = React.useState<string[]>([])
  const [status, setStatus] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const loadDomain = React.useCallback(
    async (domain: string) => {
      setStatus('')
      try {
        const value = (await rpc('get', { domain })) as Record<string, unknown> | null
        if (value === null || typeof value !== 'object') {
          setDraft({})
          setNestedKeys([])
          return
        }
        const nextDraft: Draft = {}
        const nested: string[] = []
        for (const [k, v] of Object.entries(value)) {
          if (isEditablePrimitive(v)) nextDraft[k] = v
          else nested.push(k)
        }
        setDraft(nextDraft)
        setNestedKeys(nested)
      } catch (err: any) {
        setStatus(`load failed: ${err?.message ?? String(err)}`)
      }
    },
    [rpc],
  )

  React.useEffect(() => {
    let alive = true
    rpc('list', {})
      .then(async (value: unknown) => {
        if (!alive) return
        const list = Array.isArray(value) ? (value as string[]) : []
        setDomains(list)
        const first = list[0]
        if (first !== undefined) {
          setSelected(first)
          await loadDomain(first)
        }
      })
      .catch((err: any) => alive && setStatus(`list failed: ${err?.message ?? String(err)}`))
    return () => {
      alive = false
    }
  }, [rpc, loadDomain])

  const save = async () => {
    if (!selected) return
    setBusy(true)
    setStatus('')
    try {
      await rpc('set', { domain: selected, patch: draft })
      setStatus('saved ✓')
    } catch (err: any) {
      setStatus(`save failed: ${err?.message ?? String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const fieldStyle: React.CSSProperties = {
    display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0',
  }
  const inputStyle: React.CSSProperties = {
    flex: 1, padding: '4px 8px', borderRadius: 6,
    border: '1px solid var(--dsh-border, #8884)',
    background: 'var(--dsh-bg, transparent)', color: 'inherit',
  }

  return React.createElement(
    'div',
    { style: { maxWidth: 560 } },
    React.createElement(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 } },
      domains.map((d) =>
        React.createElement(
          'button',
          {
            key: d,
            onClick: () => {
              setSelected(d)
              void loadDomain(d)
            },
            style: {
              padding: '3px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
              border: '1px solid var(--dsh-border, #8884)',
              background: d === selected ? 'var(--dsh-accent, #4a7dff)' : 'transparent',
              color: d === selected ? '#fff' : 'inherit',
            },
          },
          d,
        ),
      ),
      domains.length === 0 && !status
        ? React.createElement('span', null, 'no domains yet — install a plugin that owns one')
        : null,
    ),
    selected
      ? React.createElement(
          React.Fragment,
          null,
          Object.keys(draft).length === 0
            ? React.createElement(
                'div',
                { style: { opacity: 0.7, margin: '6px 0' } },
                `(domain "${selected}" has no primitive keys — nested objects are preserved untouched)`,
              )
            : Object.entries(draft).map(([key, value]) =>
                React.createElement(
                  'label',
                  { key, style: fieldStyle },
                  React.createElement(
                    'span',
                    { style: { minWidth: 140, fontSize: 13, opacity: 0.85 } },
                    key,
                  ),
                  typeof value === 'boolean'
                    ? React.createElement('input', {
                        type: 'checkbox',
                        checked: value,
                        onChange: (e) =>
                          setDraft((d) => ({ ...d, [key]: (e.target as HTMLInputElement).checked })),
                      })
                    : React.createElement('input', {
                        type: typeof value === 'number' ? 'number' : 'text',
                        value: String(value),
                        style: inputStyle,
                        onChange: (e) =>
                          setDraft((d) => ({
                            ...d,
                            [key]:
                              typeof value === 'number'
                                ? Number((e.target as HTMLInputElement).value)
                                : (e.target as HTMLInputElement).value,
                          })),
                      }),
                  ),
              ),
          nestedKeys.length > 0
            ? React.createElement(
                'div',
                { style: { opacity: 0.65, fontSize: 12, margin: '6px 0' } },
                `preserved untouched: ${nestedKeys.join(', ')}`,
              )
            : null,
          React.createElement(
            'button',
            {
              onClick: () => void save(),
              disabled: busy,
              style: {
                marginTop: 8, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                border: '1px solid var(--dsh-border, #8884)', color: 'inherit',
                background: 'var(--dsh-bg, transparent)',
              },
            },
            busy ? 'saving…' : `Save "${selected}"`,
          ),
        )
      : null,
    status
      ? React.createElement(
          'div',
          { style: { marginTop: 8, fontSize: 12, opacity: 0.8 } },
          status,
        )
      : null,
  )
}

export function apply(ctx: any): void {
  const slots = ctx.get?.('slots') ?? ctx.slots
  if (slots === undefined) return
  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'maestro-config', order: 60, label: 'Maestro Config' },
      () => React.createElement(MaestroConfigSection, { ctx }),
    ),
  )
}
