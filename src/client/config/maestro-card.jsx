// Verbatim port of the proven dsh-maestro-harness Settings card: fields and
// styles preserved (--dsw-alias-* tokens, masked SecretInput, sectioned
// layout, QR + model selector + project mappings). The RPC channel now
// resolves to the granular dsh-maestro-review settings-rpc row (see api.ts).
// Kept byte-faithful by design; typed entry lives in index.tsx.
/* @ts-nocheck */
import { createElement as h, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { MAESTRO_ENDPOINTS } from './api.js'
import { generateWebhookSecret, gitlabWebhookUrl } from './webhook-secret.js'

// Styling mirrors the host settings cards (ui-settings-plugins fields.module.css
// / ModelsSection.module.css) through the shared --dsw-alias-* tokens, so the
// card follows the active light/dark theme instead of hard-coding colors.
const inputStyle = {
  height: 34,
  padding: '0 12px',
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-3)',
  font: 'inherit',
  fontSize: 13,
  color: 'var(--dsw-alias-label-primary)',
  width: '100%',
  boxSizing: 'border-box',
}

const fieldLabelStyle = {
  display: 'block',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--dsw-alias-label-secondary)',
  margin: '10px 0 4px',
}

const secondaryButtonStyle = {
  height: 32,
  padding: '0 14px',
  borderRadius: 16,
  border: '1px solid var(--dsw-alias-border-l2)',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary)',
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  flex: 'none',
}

const primaryButtonStyle = {
  ...secondaryButtonStyle,
  border: 'none',
  background: 'var(--dsw-alias-button-primary-fill)',
  color: 'var(--dsw-alias-label-primary-foreground)',
}

const captionStyle = {
  fontSize: 12,
  lineHeight: 1.5,
  margin: '4px 0',
  color: 'var(--dsw-alias-label-secondary)',
}

const sectionStyle = {
  marginTop: 20,
  paddingTop: 16,
  borderTop: '1px solid var(--dsw-alias-border-l2)',
}

const headingStyle = {
  margin: '0 0 6px',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--dsw-alias-label-primary)',
}

const errorStyle = {
  color: 'var(--dsw-alias-state-error-primary)',
  fontSize: 12,
  margin: '8px 0 0',
}

const codeStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  color: 'var(--dsw-alias-label-primary)',
  wordBreak: 'break-all',
}

/** QR code centered in a light tile with an even scanner-friendly quiet zone. */
function QrImage({ url, size = 104 }) {
  const [dataUrl, setDataUrl] = useState(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, { margin: 0, width: size * 2 })
      .then((d) => { if (live) setDataUrl(d) })
      .catch(() => {})
    return () => { live = false }
  }, [url, size])
  return h('div', {
    style: {
      background: '#ffffff',
      borderRadius: 10,
      boxSizing: 'border-box',
      width: size + 20,
      height: size + 20,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      lineHeight: 0,
      flex: 'none',
      alignSelf: 'flex-start',
    },
  },
  dataUrl === null
    ? h('div', { style: { width: size, height: size, background: 'var(--dsw-alias-bg-skeleton)', borderRadius: 4 } })
    : h('img', { src: dataUrl, alt: url, width: size, height: size, style: { display: 'block' } }),
  )
}

function NamedTunnelSetupNote() {
  return h('div', { style: captionStyle },
    h('p', { style: { ...captionStyle, marginBottom: 4 } }, 'Named tunnel needs a one-time manual setup (requires your own Cloudflare account — cannot be automated):'),
    h('ol', { style: { margin: '4px 0', paddingLeft: 20 } },
      h('li', null, 'cloudflared tunnel login'),
      h('li', null, 'cloudflared tunnel create dsh-maestro-webhook'),
      h('li', null, 'cloudflared tunnel route dns dsh-maestro-webhook <your-hostname>'),
      h('li', null, 'Paste the printed Tunnel ID, the credentials file path (~/.cloudflared/<id>.json), and the hostname below.'),
    ),
  )
}

function ReviewModelSelector({ value, catalog, fallbackValue, fallbackLabel, onChange, label }) {
  const groups = catalog?.groups ?? []
  const providers = groups.map(g => g.provider)
  const selectedProvider = value?.provider ?? ''
  const providerGroup = groups.find(g => g.provider === selectedProvider)
  const models = providerGroup?.models ?? []
  const selectedEffort = value?.reasoningEffort ?? ''
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState('root')
  const rootRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setPane('root') } }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setPane('root') } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  const update = (field, newVal) => {
    if (newVal === '' && field === 'provider') { onChange(null); setOpen(false); setPane('root'); return }
    const next = { provider: value?.provider ?? '', model: value?.model ?? '', ...(value?.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {}) }
    if (field === 'provider') { const g = groups.find(x => x.provider === newVal); next.provider = newVal; next.model = g?.models[0] ?? '' }
    else if (field === 'model') { next.model = newVal }
    else if (field === 'reasoningEffort') { if (newVal === '') delete next.reasoningEffort; else next.reasoningEffort = newVal }
    if (!next.provider || !next.model) { onChange(null) } else { onChange(next) }
  }
  const effectiveFallback = fallbackValue !== undefined ? fallbackValue : (catalog?.current ?? null)
  const effectiveFallbackLabel = fallbackLabel ?? 'Use DSH default'
  const triggerLabel = value
    ? `${value.provider} / ${value.model}${value.reasoningEffort ? ` · ${value.reasoningEffort}` : ''}`
    : effectiveFallback
      ? `${effectiveFallbackLabel} · ${effectiveFallback.provider}/${effectiveFallback.model}${effectiveFallback.reasoningEffort ? ` · ${effectiveFallback.reasoningEffort}` : ''}`
      : effectiveFallbackLabel
  const triggerStyle = {
    height: 32,
    padding: '0 12px 0 14px',
    borderRadius: 20,
    border: '1px solid var(--dsw-alias-border-l2)',
    background: 'var(--dsw-alias-bg-layer-2)',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: 13,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    maxWidth: 320,
    whiteSpace: 'nowrap',
  }
  const menuStyle = {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: 0,
    minWidth: 300,
    maxWidth: 360,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 12,
    boxShadow: '0 8 24px rgba(0,0,0,.12)',
    zIndex: 20,
    padding: 6,
  }
  const rowStyle = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '9px 10px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: 'var(--dsw-alias-label-primary)',
    font: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
  }
  const check = (active) => active ? h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', style: { flex: 'none' } }, h('path', { d: 'M3.5 8.2l2.8 2.8L12.5 4.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' })) : h('span', { style: { width: 16, flex: 'none' } })
  const chevronDown = h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', style: { flex: 'none', opacity: 0.7 } }, h('path', { d: 'M3.5 5L7 8.5L10.5 5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
  const chevronRight = h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', style: { flex: 'none', opacity: 0.6 } }, h('path', { d: 'M5 3.5L8.5 7L5 10.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
  const effortLabel = selectedEffort === '' ? 'Default effort' : selectedEffort
  const modelLabel = selectedProvider === '' ? 'Select model' : (value?.model ?? 'Select model')
  return h('div', { ref: rootRef, style: { position: 'relative', display: 'inline-block', maxWidth: '100%' } },
    label && h('span', { style: fieldLabelStyle }, label),
    h('button', { type: 'button', style: triggerStyle, onClick: () => { setOpen(v => !v); setPane('root') }, 'aria-expanded': open, 'aria-haspopup': 'menu', title: triggerLabel },
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, triggerLabel),
      chevronDown,
    ),
    open && h('div', { style: menuStyle, role: 'menu' },
      pane === 'root' && h('div', null,
        h('button', { type: 'button', style: { ...rowStyle, background: !value ? 'var(--dsw-alias-bg-layer-2)' : 'transparent' }, onClick: () => { onChange(null); setOpen(false) } },
          h('span', null, effectiveFallbackLabel),
          check(!value),
        ),
        h('div', { style: { height: 1, background: 'var(--dsw-alias-border-l2)', margin: '6px 2px' } }),
        h('button', { type: 'button', style: rowStyle, onClick: () => setPane('model') },
          h('span', null, 'Model'),
          h('span', { style: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dsw-alias-label-secondary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, modelLabel), chevronRight),
        ),
        h('button', { type: 'button', style: rowStyle, onClick: () => setPane('effort') },
          h('span', null, 'Effort'),
          h('span', { style: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--dsw-alias-label-secondary)' } }, effortLabel, chevronRight),
        ),
        value && h('p', { style: { ...captionStyle, margin: '8px 4px 2px' } }, `Selected: ${value.provider} / ${value.model}${value.reasoningEffort ? ` (${value.reasoningEffort})` : ''}`),
        !value && effectiveFallback && h('p', { style: { ...captionStyle, margin: '8px 4px 2px' } }, `${effectiveFallbackLabel === 'Use Global' ? 'Using Global' : 'Using DSH default'}: ${effectiveFallback.provider} / ${effectiveFallback.model}${effectiveFallback.reasoningEffort ? ` (${effectiveFallback.reasoningEffort})` : ''}`),
      ),
      pane === 'model' && h('div', null,
        h('button', { type: 'button', style: { ...rowStyle, color: 'var(--dsw-alias-label-secondary)' }, onClick: () => setPane('root') }, h('span', null, '← Back'), h('span', { style: { fontSize: 12 } }, 'Model')),
        h('div', { style: { maxHeight: 260, overflowY: 'auto', marginTop: 4 } },
          providers.length === 0 ? h('p', { style: captionStyle }, 'No providers') :
          providers.map(p => {
            const g = groups.find(x => x.provider === p)
            const ms = g?.models ?? []
            return h('div', { key: p, style: { marginBottom: 8 } },
              h('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', padding: '6px 10px 2px', textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 } }, h('span', { style: { width: 6, height: 6, borderRadius: 3, background: 'var(--dsw-alias-border-l2)', flex: 'none' } }), g?.name ?? p),
              ms.length === 0 ? h('p', { style: { ...captionStyle, padding: '2px 10px 2px 28px' } }, 'No models') :
              h('div', { style: { marginLeft: 12, borderLeft: '1px solid var(--dsw-alias-border-l2)', paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 } },
                ms.map(m => h('button', { key: m, type: 'button', style: { ...rowStyle, paddingLeft: 10, background: value?.provider === p && value?.model === m ? 'var(--dsw-alias-bg-layer-2)' : 'transparent' }, onClick: () => { update('model', m); if (value?.provider !== p) update('provider', p); else { const next = { provider: p, model: m, ...(selectedEffort ? { reasoningEffort: selectedEffort } : {}) }; onChange(next); setPane('root') } } }, h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, m), check(value?.provider === p && value?.model === m)))),
            )
          }),
        ),
      ),
      pane === 'effort' && h('div', null,
        h('button', { type: 'button', style: { ...rowStyle, color: 'var(--dsw-alias-label-secondary)' }, onClick: () => setPane('root') }, h('span', null, '← Back'), h('span', { style: { fontSize: 12 } }, 'Effort')),
        h('div', { style: { marginTop: 4 } },
          [
            { id: '', label: 'Default effort' },
            { id: 'low', label: 'low' },
            { id: 'medium', label: 'medium' },
            { id: 'high', label: 'high' },
          ].map(e => h('button', { key: e.id || 'default', type: 'button', style: { ...rowStyle, background: selectedEffort === e.id ? 'var(--dsw-alias-bg-layer-2)' : 'transparent' }, onClick: () => { update('reasoningEffort', e.id); setPane('root') } }, h('span', null, e.label), check(selectedEffort === e.id))),
        ),
      ),
    ),
  )
}

function ProjectMappingsEditor({ mappings, onChange, catalog, globalReviewModel }) {
  const rows = mappings.length > 0 ? mappings : [{ projectPath: '', localRepoPath: '', reviewProfile: 'magento2' }]
  const updateRow = (index, field, value) => {
    const next = rows.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    onChange(next.filter(r => r.projectPath !== '' || r.localRepoPath !== ''))
  }
  const removeRow = (index) => onChange(rows.filter((_, i) => i !== index))
  const addRow = () => onChange([...rows, { projectPath: '', localRepoPath: '', reviewProfile: 'magento2' }])
  return h('div', null,
    h('span', { style: fieldLabelStyle }, 'Tracked projects (GitLab path → local repo checkout → review profile → review model override)'),
    rows.map((row, i) => h('div', { key: i, 'data-maestro-mapping-row': '', style: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' } },
      h('input', { placeholder: 'group/project', style: { ...inputStyle, flex: '1 1 120px' }, value: row.projectPath, onChange: e => updateRow(i, 'projectPath', e.target.value) }),
      h('input', { placeholder: '/path/to/local/clone', style: { ...inputStyle, flex: '1 1 140px' }, value: row.localRepoPath, onChange: e => updateRow(i, 'localRepoPath', e.target.value) }),
      h('select', { style: { ...inputStyle, flex: '0 0 130px' }, value: row.reviewProfile ?? 'magento2', onChange: e => updateRow(i, 'reviewProfile', e.target.value) },
        h('option', { value: 'magento2' }, 'Magento 2'),
        h('option', { value: 'generic' }, 'Generic'),
      ),
      h('div', { style: { flex: '0 0 auto' } },
        h(ReviewModelSelector, {
          value: row.reviewModel ?? null,
          catalog,
          fallbackValue: globalReviewModel ?? catalog?.current ?? null,
          fallbackLabel: globalReviewModel ? 'Use Global' : 'Use DSH default',
          onChange: v => updateRow(i, 'reviewModel', v),
          label: null,
        }),
      ),
      h('button', { onClick: () => removeRow(i), style: secondaryButtonStyle, title: 'Remove mapping' }, '✕'),
    )),
    h('button', { onClick: addRow, style: secondaryButtonStyle }, '+ Add mapping'),
  )
}

/**
 * Password field for a stored secret the server never echoes back
 * (`getConfig` masks secrets). Empty by default; a typed value saves on blur,
 * an untouched field keeps the stored secret, and Clear writes '' to erase it.
 */
function SecretInput({ label, placeholder, hasSaved, onSave }) {
  const [draft, setDraft] = useState('')
  const clear = () => { setDraft(''); onSave('') }
  return h('div', null,
    h('label', { style: fieldLabelStyle }, label),
    h('div', { style: { display: 'flex', gap: 8 } },
      h('input', {
        placeholder: hasSaved === true ? 'saved — leave blank to keep' : placeholder,
        type: 'password',
        autoComplete: 'off',
        style: inputStyle,
        value: draft,
        onChange: e => setDraft(e.target.value),
        onBlur: () => { if (draft !== '') onSave(draft) },
      }),
      hasSaved === true && h('button', { type: 'button', style: secondaryButtonStyle, onClick: clear }, 'Clear'),
    ),
  )
}

/** Simple checked/unchecked toggle bound to a boolean settings key. */
function ToggleField({ label, caption, checked, onChange }) {
  return h('label', { style: { display: 'flex', alignItems: 'flex-start', gap: 8, margin: '8px 0', cursor: 'pointer' } },
    h('input', { type: 'checkbox', checked: checked === true, onChange: e => onChange(e.target.checked), style: { marginTop: 3 } }),
    h('span', null,
      h('div', { style: { fontSize: 13 } }, label),
      caption != null && h('div', { style: captionStyle }, caption),
    ),
  )
}

/** Newest-first list of recorded review runs from the host's reviews.json. */
function ReviewHistoryPanel({ rpcCall }) {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    rpcCall(MAESTRO_ENDPOINTS.reviewsList, {})
      .then(res => { if (res?.ok) setEntries(res.value ?? []) })
      .catch(() => setEntries([]))
  }, [])
  if (entries === null) return h('p', { style: captionStyle }, 'Loading review history…')
  if (entries.length === 0) return h('p', { style: captionStyle }, 'No reviews recorded yet.')
  const icon = entry => entry.status === 'completed' ? '✅' : entry.status === 'failed' ? '⚠️' : '👀'
  return h('ul', { style: { listStyle: 'none', margin: 0, padding: 0 } },
    entries.map(entry => h('li', { key: entry.id, style: { padding: '6px 0', borderBottom: '1px solid var(--dsw-alias-separator-default, #333)', fontSize: 13 } },
      h('span', null, `${icon(entry)} ${entry.projectPath} !${entry.mrIid} · ${entry.mode}${entry.trigger !== 'mention' ? ` · ${entry.trigger}` : ''}`),
      h('div', { style: captionStyle },
        `${new Date(entry.startedAt).toLocaleString()}${entry.summary ? ` — ${entry.summary}` : ''}${entry.error ? ` — ${entry.error}` : ''}`),
    )),
  )
}

/** One selectable LAN address chip + the QR of the currently selected URL. */
function LanAccess({ proxyStatus, lanPin }) {
  const urls = proxyStatus?.lanUrls ?? []
  const [selected, setSelected] = useState(0)
  const index = Math.min(selected, Math.max(urls.length - 1, 0))
  if (!proxyStatus?.running) {
    return h('p', { style: errorStyle }, proxyStatus?.errorMessage ?? 'Proxy not running')
  }
  return h('div', null,
    h('p', { style: captionStyle }, lanPin?.enabled === true
      ? 'Open this full DSH UI from any device on your network — visitors enter the LAN PIN below.'
      : 'Open this full DSH UI from any device on your network — no PIN needed.'),
    urls.length > 0 && h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 } },
      urls.map((url, i) => h('button', {
        key: url,
        onClick: () => setSelected(i),
        style: {
          ...secondaryButtonStyle,
          height: 26,
          padding: '0 10px',
          fontSize: 12,
          borderRadius: 13,
          ...(i === index
            ? { background: 'var(--dsw-alias-button-primary-fill)', borderColor: 'transparent', color: 'var(--dsw-alias-label-primary-foreground)' }
            : {}),
        },
      }, url.replace(/^http:\/\//, ''))),
    ),
    urls.length > 0 && h('div', { style: { display: 'flex', gap: 14, alignItems: 'center' } },
      h(QrImage, { url: urls[index], size: 116 }),
      h('div', null,
        h('div', { style: codeStyle }, urls[index]),
        h('p', { style: captionStyle }, 'Scan with a phone connected to the same network.'),
      ),
    ),
    lanPin !== null && h(LanPinRow, { lanPin }),
  )
}

/** Opt-in LAN PIN: off keeps the LAN open; on shows the PIN with Show/Rotate. */
function LanPinRow({ lanPin }) {
  return h('div', { style: { marginTop: 12 } },
    h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' } },
      h('input', {
        type: 'checkbox',
        checked: lanPin.enabled,
        onChange: e => lanPin.onToggle(e.target.checked),
        style: { width: 15, height: 15, accentColor: 'var(--dsw-alias-button-primary-fill)' },
      }),
      h('span', { style: { ...fieldLabelStyle, margin: 0 } }, 'Require a PIN on the LAN'),
    ),
    lanPin.enabled && h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } },
      h('span', { style: { ...fieldLabelStyle, margin: 0 } }, 'LAN PIN'),
      h('code', { style: { ...codeStyle, fontSize: 15, letterSpacing: 2 } }, lanPin.show ? lanPin.pin ?? '••••••••' : '••••••••'),
      lanPin.show
        ? h('button', { onClick: lanPin.onHide, style: secondaryButtonStyle }, 'Hide')
        : h('button', { onClick: lanPin.onShow, style: secondaryButtonStyle }, 'Show'),
      h('button', { onClick: lanPin.onRotate, style: secondaryButtonStyle }, 'Rotate'),
    ),
  )
}

function PublicAccess({ status, pin, showPin, onRevealPin, onHidePin, onRotatePin }) {
  return h('div', null,
    status?.running && status?.publicUrl
      ? h('div', null,
          h('div', { style: { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12 } },
            h(QrImage, { url: status.publicUrl, size: 116 }),
            h('div', null,
              h('div', { style: codeStyle }, status.publicUrl),
              h('p', { style: captionStyle }, 'Works from anywhere; visitors enter the PIN below.'),
            ),
          ),
        )
      : h('p', { style: captionStyle }, 'Start the tunnel to get a public address.'),
    h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
      h('span', { style: { ...fieldLabelStyle, margin: 0 } }, 'Access PIN'),
      h('code', { style: { ...codeStyle, fontSize: 15, letterSpacing: 2 } }, showPin && pin !== null ? pin : '••••••••'),
      showPin
        ? h('button', { onClick: onHidePin, style: secondaryButtonStyle }, 'Hide')
        : h('button', { onClick: onRevealPin, style: secondaryButtonStyle }, 'Show'),
      h('button', { onClick: onRotatePin, style: secondaryButtonStyle }, 'Rotate'),
    ),
    h('p', { style: captionStyle }, 'Stays the same across tunnel and DSH restarts; use Rotate when you need a new PIN.'),
  )
}

export function MaestroSettingsTab({ rpcCall }) {
  const [status, setStatus] = useState(null)
  const [proxyStatus, setProxyStatus] = useState(null)
  const [config, setConfig] = useState({ tunnelMode: 'quick', projectMappings: [] })
  const [catalog, setCatalog] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [pin, setPin] = useState(null)
  const [showPin, setShowPin] = useState(false)
  const [lanPinEnabled, setLanPinEnabled] = useState(false)
  const [lanPin, setLanPin] = useState(null)
  const [showLanPin, setShowLanPin] = useState(false)

  const call = async (endpoint, payload) => {
    const res = await rpcCall(endpoint, payload)
    if (!res?.ok) throw new Error(res?.error?.message ?? 'RPC failed')
    return res.value
  }

  const refresh = async () => {
    try { setStatus(await call(MAESTRO_ENDPOINTS.status, {})) } catch { /* transient failure, ignore */ }
    try { setProxyStatus(await call(MAESTRO_ENDPOINTS.proxyStatus, {})) } catch { /* proxy row may be starting */ }
  }

  // Load previously-saved config once on mount — without this, every field
  // (including project mappings) would render empty on every page load even
  // after being saved, since RPC state is not persisted in the component.
  useEffect(() => {
    call(MAESTRO_ENDPOINTS.getConfig, {})
      .then(saved => setConfig(prev => ({ ...prev, ...saved })))
      .catch(() => { /* first run, no config saved yet — keep defaults */ })
    call(MAESTRO_ENDPOINTS.lanPinStatus, {})
      .then(value => { setLanPinEnabled(value.enabled); if (value.enabled) setLanPin(value.pin ?? null) })
      .catch(() => { /* host without the LAN PIN endpoints — keep the row hidden */ })
    call(MAESTRO_ENDPOINTS.modelsList, {})
      .then(value => setCatalog(value))
      .catch(() => { /* catalog may be unavailable before provider is configured */ })
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])

  const revealPin = async () => {
    if (pin === null) {
      try { setPin((await call(MAESTRO_ENDPOINTS.getPin, {})).pin) } catch (err) { setError(err.message) }
    }
    setShowPin(true)
  }

  const rotatePin = async () => {
    setError(null)
    try {
      const fresh = (await call(MAESTRO_ENDPOINTS.rotatePin, {})).pin
      setPin(fresh)
      setShowPin(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleLanPin = async (enabled) => {
    setError(null)
    const previous = lanPinEnabled
    setLanPinEnabled(enabled)
    try {
      await call(MAESTRO_ENDPOINTS.lanPinSetEnabled, { enabled })
      if (enabled) {
        const value = await call(MAESTRO_ENDPOINTS.lanPinStatus, {})
        setLanPin(value.pin ?? null)
        setShowLanPin(true)
      } else {
        setLanPin(null)
        setShowLanPin(false)
      }
    } catch (err) {
      setLanPinEnabled(previous)
      setError(err.message)
    }
  }

  const revealLanPin = async () => {
    if (lanPin === null) {
      try { setLanPin((await call(MAESTRO_ENDPOINTS.lanPinStatus, {})).pin ?? null) } catch (err) { setError(err.message) }
    }
    setShowLanPin(true)
  }

  const rotateLanPin = async () => {
    setError(null)
    try {
      const fresh = (await call(MAESTRO_ENDPOINTS.lanPinRotate, {})).pin
      setLanPin(fresh)
      setShowLanPin(true)
    } catch (err) {
      setError(err.message)
    }
  }

  const startTunnel = async () => {
    setBusy(true)
    setError(null)
    try { setStatus(await call(MAESTRO_ENDPOINTS.tunnelStart, {})) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const stopTunnel = async () => {
    setBusy(true)
    setError(null)
    try { setStatus(await call(MAESTRO_ENDPOINTS.tunnelStop, {})) } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const saveField = async (field, value) => {
    setError(null)
    setConfig(prev => ({ ...prev, [field]: value }))
    try {
      await call(MAESTRO_ENDPOINTS.saveConfig, { [field]: value })
    } catch (err) {
      setError(err.message)
    }
  }

  return h('div', { 'data-maestro-settings-card': '', style: { maxWidth: 520 } },
    h('h3', { style: { ...headingStyle, fontSize: 15, margin: '0 0 12px' } }, 'Maestro'),

    h('label', { style: fieldLabelStyle }, 'Tunnel mode'),
    h('select', { value: config.tunnelMode, style: inputStyle, onChange: e => saveField('tunnelMode', e.target.value) },
      h('option', { value: 'quick' }, 'Quick (no setup, URL changes on restart)'),
      h('option', { value: 'named' }, 'Named (stable URL, one-time setup)'),
    ),
    config.tunnelMode === 'named' && h(NamedTunnelSetupNote),
    config.tunnelMode === 'named' && h('div', null,
      h('label', { style: fieldLabelStyle }, 'Tunnel ID'),
      h('input', { placeholder: 'Tunnel ID', style: inputStyle, value: config.tunnelId ?? '', onChange: e => saveField('tunnelId', e.target.value) }),
      h('label', { style: fieldLabelStyle }, 'Credentials file path'),
      h('input', { placeholder: '~/.cloudflared/<id>.json', style: inputStyle, value: config.tunnelCredentialsFile ?? '', onChange: e => saveField('tunnelCredentialsFile', e.target.value) }),
      h('label', { style: fieldLabelStyle }, 'Hostname'),
      h('input', { placeholder: 'dsh.example.com', style: inputStyle, value: config.tunnelHostname ?? '', onChange: e => saveField('tunnelHostname', e.target.value) }),
    ),
    h('div', { style: { marginTop: 12 } },
      status?.running
        ? h('button', { disabled: busy, onClick: stopTunnel, style: secondaryButtonStyle }, 'Stop tunnel')
        : h('button', { disabled: busy, onClick: startTunnel, style: primaryButtonStyle }, 'Start tunnel'),
    ),

    h('div', { style: sectionStyle },
      h('h4', { style: headingStyle }, 'Remote access (LAN)'),
      h(LanAccess, {
        proxyStatus,
        lanPin: lanPinEnabled === null ? null : {
          enabled: lanPinEnabled,
          pin: lanPin,
          show: showLanPin,
          onShow: revealLanPin,
          onHide: () => setShowLanPin(false),
          onRotate: rotateLanPin,
          onToggle: toggleLanPin,
        },
      }),
    ),

    h('div', { style: sectionStyle },
      h('h4', { style: headingStyle }, 'Public access'),
      h(PublicAccess, { status, pin, showPin, onRevealPin: revealPin, onHidePin: () => setShowPin(false), onRotatePin: rotatePin }),
    ),

    h('div', { style: sectionStyle },
      h('h4', { style: headingStyle }, 'Telegram notifications'),
      h('p', { style: captionStyle }, 'Send one protected startup update with the current public-access PIN to a single Telegram chat.'),
      h(SecretInput, {
        label: 'Bot token',
        placeholder: '123456:ABC-DEF...',
        hasSaved: config.hasTelegramBotToken,
        onSave: value => saveField('telegramBotToken', value),
      }),
      h('label', { style: fieldLabelStyle }, 'Chat ID'),
      h('input', { placeholder: '-1001234567890', autoComplete: 'off', style: inputStyle, value: config.telegramChatId ?? '', onChange: e => saveField('telegramChatId', e.target.value) }),
      h(ToggleField, {
        label: 'Also notify about finished reviews',
        caption: 'One message per review run with its outcome and a short summary.',
        checked: config.telegramReviewNotifications,
        onChange: checked => saveField('telegramReviewNotifications', checked),
      }),
      h('p', { style: captionStyle }, 'Leave either credential blank to disable notifications. Telegram delivery failures never prevent DSH from starting.'),
    ),

    h('div', { style: sectionStyle },
      h('h4', { style: headingStyle }, 'GitLab'),
      h('label', { style: fieldLabelStyle }, 'GitLab base URL'),
      h('input', { placeholder: 'https://gitlab.example.com', style: inputStyle, value: config.gitlabBaseUrl ?? '', onChange: e => saveField('gitlabBaseUrl', e.target.value) }),
      h(SecretInput, {
        label: 'GitLab token',
        placeholder: 'GitLab token',
        hasSaved: config.hasGitlabToken,
        onSave: value => saveField('gitlabToken', value),
      }),
      h('label', { style: fieldLabelStyle }, 'Bot username'),
      h('input', { placeholder: 'maestro-bot', style: inputStyle, value: config.botUsername ?? '', onChange: e => saveField('botUsername', e.target.value) }),
      h(SecretInput, {
        label: 'Webhook secret',
        placeholder: 'Webhook secret',
        hasSaved: config.hasWebhookSecret,
        onSave: value => saveField('webhookSecret', value),
      }),
      h('button', { type: 'button', style: { ...secondaryButtonStyle, marginTop: 10 }, onClick: () => saveField('webhookSecret', generateWebhookSecret()) }, 'Generate new secret'),
      h('p', { style: captionStyle }, 'In GitLab: Settings → Webhooks, set Secret token to this value and enable Merge request events.'),
      h('p', { style: captionStyle }, 'Webhook URL:'),
      h('code', { style: codeStyle }, gitlabWebhookUrl(config.tunnelHostname)),
      h('p', { style: captionStyle }, 'Overrides MAESTRO_GITLAB_WEBHOOK_SECRET immediately, no restart needed.'),
    ),

    h('div', { style: sectionStyle },
      h('h4', { style: headingStyle }, 'Review automation'),
      h(ToggleField, {
        label: 'Re-review when new commits are pushed',
        caption: 'After a completed review, further pushes to the same MR trigger an automatic quick re-review.',
        checked: config.autoRereviewOnPush,
        onChange: checked => saveField('autoRereviewOnPush', checked),
      }),
      h(ReviewHistoryPanel, { rpcCall }),
    ),

    h('div', { style: sectionStyle },
      h('h4', { style: headingStyle }, 'Review model'),
      h('p', { style: captionStyle }, 'Model used for automated GitLab reviews (reviewer & auditor). Empty = DSH default. Per-project empty = inherits Global, or DSH default when Global is empty.'),
      h(ReviewModelSelector, {
        value: config.reviewModel ?? null,
        catalog,
        fallbackValue: catalog?.current ?? null,
        fallbackLabel: 'Use DSH default',
        onChange: v => saveField('reviewModel', v),
        label: 'Global review model',
      }),
    ),

    h('div', { style: sectionStyle },
      h('h4', { style: headingStyle }, 'Projects'),
      h(ProjectMappingsEditor, { mappings: config.projectMappings ?? [], onChange: mappings => saveField('projectMappings', mappings), catalog, globalReviewModel: config.reviewModel ?? null }),
    ),

    error && h('p', { style: errorStyle }, error),
  )
}

// Injected synchronously at apply time (deferred effects can stall behind
// unavailable slot scopes); the external plugin's stylesheet handles
// everything outside this card.
function installMaestroMobileCss() {
  if (document.querySelector('style[data-plugin-css="maestro/mobile-maestro.css"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = name
  tag.dataset.pluginCss = 'maestro/mobile-maestro.css'
  tag.textContent = MAESTRO_MOBILE_CSS + SETTINGS_NAV_CSS
  document.head.appendChild(tag)
}

