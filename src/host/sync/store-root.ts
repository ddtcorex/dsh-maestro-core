/**
 * sync/store-root.ts — where the memory store lives, resolved the same way the plugin
 * resolves it.
 *
 * Core cannot import the plugin (separate package, separate release), so this is a
 * deliberate second implementation. `tests/sync/store-root-parity.spec.ts` runs the
 * shared fixture against it, and the plugin runs the same fixture against its own
 * copy, so a rule change on one side fails on that side instead of drifting silently.
 *
 * The rules, in order:
 * 1. `memoryDir` (explicit config) wins.
 * 2. `MAESTRO_MEMORY_DIR` wins next.
 * 3. A `DSH_HOME` that realpaths somewhere other than `<home>/.dsh` is an isolated run
 *    (dry-boot, test, second profile): the store stays inside it.
 * 4. Otherwise the neutral root, `<home>/.maestro-memory`.
 */

import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type StoreRootMode = 'configured' | 'env' | 'isolated' | 'default';

export interface StoreRoot {
  root: string;
  mode: StoreRootMode;
}

function realpathOr(value: string): string {
  try {
    return realpathSync.native(value);
  } catch {
    return value;
  }
}

export function resolveStoreRoot(
  opts: { memoryDir?: string | null; env?: NodeJS.ProcessEnv; home?: string } = {},
): StoreRoot {
  if (opts.memoryDir) return { root: opts.memoryDir, mode: 'configured' };
  const env = opts.env ?? process.env;
  const envDir = typeof env.MAESTRO_MEMORY_DIR === 'string' ? env.MAESTRO_MEMORY_DIR.trim() : '';
  if (envDir) return { root: envDir, mode: 'env' };

  const home = realpathOr(opts.home ?? homedir());
  const dshDefault = join(home, '.dsh');
  const rawDsh = typeof env.DSH_HOME === 'string' && env.DSH_HOME.trim() ? env.DSH_HOME.trim() : '';
  if (rawDsh && realpathOr(rawDsh) !== dshDefault) {
    return { root: join(rawDsh, 'maestro-memory'), mode: 'isolated' };
  }
  return { root: join(home, '.maestro-memory'), mode: 'default' };
}

/** Map a wire path onto the local filesystem. Wire paths never change; roots do. */
export function localPathForWirePath(
  wirePath: string,
  roots: { storeRoot: string; localDsh: string },
): string {
  if (wirePath.startsWith('maestro-memory/')) {
    return join(roots.storeRoot, wirePath.slice('maestro-memory/'.length));
  }
  return join(roots.localDsh, wirePath);
}
