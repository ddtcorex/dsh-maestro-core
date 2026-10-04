import * as lib from '@ddtcorex/dsh-maestro-config-lib'

export interface MaestroConfigService {
  /** Union of schema-registered domains and domains present in the store file. */
  listDomains(): Promise<string[]>
  get(domain: string): Promise<unknown>
  /** Deep-merges the patch into the domain (same semantics as the lib). */
  set(domain: string, patch: object): Promise<void>
  /** Deletes one top-level key of a domain; false when there was nothing to delete. */
  unset(domain: string, key: string): Promise<boolean>
  onChange(cb: (domain: string) => void): () => void
}

/**
 * Thin facade over @ddtcorex/dsh-maestro-config-lib. `dshHome` defaults to the
 * lib's resolution (explicit > DSH_HOME env > ~/.dsh); tests inject a tmpdir.
 */
export function createMaestroConfigService(opts?: { dshHome?: string }): MaestroConfigService {
  const libOpts = opts?.dshHome ? { dshHome: opts.dshHome } : undefined
  return {
    async listDomains() {
      const doc = await lib.load(libOpts)
      return [...new Set([...lib.definedDomains(), ...Object.keys(doc.domains)])]
    },
    async get(domain) {
      return lib.get(domain, libOpts)
    },
    async set(domain, patch) {
      await lib.set(domain, patch, libOpts)
    },
    async unset(domain, key) {
      return lib.unset(domain, key, libOpts)
    },
    onChange(cb) {
      return lib.onChange(cb)
    },
  }
}
