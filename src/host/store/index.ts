import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir, open, readFile, rename, unlink, stat, rm, writeFile } from 'node:fs/promises'

export interface SettingsDoc {
  version: 1
  domains: Record<string, unknown>
}

/** Minimal structural validator a domain owner supplies (schemastery/zod adapters fit). */
export interface DomainValidator {
  parse(value: unknown): { ok: true; value?: unknown } | { ok: false; error: string }
}

const EMPTY_DOC: SettingsDoc = { version: 1, domains: {} }

const domainValidators = new Map<string, DomainValidator>()
const changeCbs = new Set<(domain: string) => void>()

let cached: { key: string; doc: SettingsDoc } | null = null

function resolveDshHome(explicit?: string): string {
  return explicit ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

function storePath(opts?: { dshHome?: string }): string {
  return join(resolveDshHome(opts?.dshHome), 'maestro', 'settings.json')
}

/** Register a validator for a domain you own. Writes to it are validated on every set(). */
export function defineDomain(name: string, validator: DomainValidator): void {
  domainValidators.set(name, validator)
}

/** Fire callbacks registered through this instance after a successful set(). */
export function onChange(cb: (domain: string) => void): () => void {
  changeCbs.add(cb)
  return () => {
    changeCbs.delete(cb)
  }
}

/** Test seam: drop the memoized document and listeners (schemas are kept). */
export function resetForTests(): void {
  cached = null
  changeCbs.clear()
}

// ---------------------------------------------------------------------------
// locking + io
// ---------------------------------------------------------------------------

async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true }) // the store dir may not exist on first write
  const lockPath = `${path}.lock`
  const deadline = Date.now() + 5_000
  let handle: Awaited<ReturnType<typeof open>> | null = null
  for (;;) {
    try {
      handle = await open(lockPath, 'wx')
      break
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err
      // Break stale locks left behind by a crashed writer.
      try {
        const st = await stat(lockPath)
        if (Date.now() - st.mtimeMs > 5_000) {
          await rm(lockPath, { force: true })
          continue
        }
      } catch {
        /* lock vanished between stat and now — just retry */
      }
      if (Date.now() > deadline) throw new Error(`config-lib: lock timeout at ${lockPath}`)
      await new Promise((r) => setTimeout(r, 20))
    }
  }
  try {
    return await fn()
  } finally {
    await unlink(lockPath).catch(() => {})
    void handle // closed fd via unlink; keep handle referenced for GC clarity
  }
}

function parseDoc(raw: string): SettingsDoc {
  const parsed = JSON.parse(raw) as Partial<SettingsDoc>
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') {
    throw new Error('config-lib: malformed settings document')
  }
  return { version: 1, domains: (parsed.domains as Record<string, unknown>) ?? {} }
}

async function readDoc(path: string): Promise<SettingsDoc> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ...EMPTY_DOC, domains: {} }
    throw err
  }
  return parseDoc(raw)
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (
    base !== null && typeof base === 'object' && !Array.isArray(base) &&
    patch !== null && typeof patch === 'object' && !Array.isArray(patch)
  ) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      out[k] = k in out ? deepMerge(out[k], v) : v
    }
    return out
  }
  return patch
}

async function writeDocLocked(path: string, doc: SettingsDoc): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${Math.random().toString(16).slice(2, 10)}`
  await writeFile(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, path) // atomic on the same filesystem; rename carries the 600 mode
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export async function load(opts?: { dshHome?: string }): Promise<SettingsDoc> {
  const key = resolveDshHome(opts?.dshHome)
  if (cached && cached.key === key) return cached.doc
  const doc = await readDoc(storePath(opts))
  cached = { key, doc }
  return doc
}

export async function get(domain: string, opts?: { dshHome?: string }): Promise<unknown> {
  const doc = await load(opts)
  return doc.domains[domain]
}

export async function set(
  domain: string,
  patch: object,
  opts?: { dshHome?: string },
): Promise<void> {
  const path = storePath(opts)
  const key = resolveDshHome(opts?.dshHome)
  await withLock(path, async () => {
    const doc = await readDoc(path)
    const validator = domainValidators.get(domain)
    const merged = deepMerge(doc.domains[domain], patch)
    if (validator) {
      const res = validator.parse(merged)
      if (!res.ok) throw new Error(`config-lib: validation failed for '${domain}': ${res.error}`)
    }
    doc.domains[domain] = merged
    await writeDocLocked(path, doc)
    cached = { key, doc }
  })
  for (const cb of changeCbs) cb(domain)
}
