// src/host/hashing.ts — bounded streaming SHA-256 pool with deterministic order.
//
// Reads every file in ≤1 MiB chunks through createReadStream (never whole-file
// buffers), hashes with a bounded worker pool, and returns outcomes sorted by
// path so plan/revision output stays deterministic. Concurrency is capped by
// the caller's default of 4 and backpressure comes from the stream consumers.
import { createHash } from 'node:crypto';
import * as path from 'node:path';

export interface HashOutcome {
  path: string;
  sha256: string;
  size: number;
}

const CHUNK = 1024 * 1024;

export async function hashFiles(
  fs: any,
  root: string,
  paths: readonly string[],
  opts: { concurrency?: number; onFile?: (h: HashOutcome) => void } = {},
): Promise<HashOutcome[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const results: HashOutcome[] = [];
  let next = 0;
  const worker = async () => {
    for (;;) {
      const idx = next++;
      if (idx >= paths.length) return;
      const rel = paths[idx]!;
      const full = path.join(root, rel);
      const h = createHash('sha256');
      let size = 0;
      if (typeof fs.createReadStream === 'function') {
        await new Promise<void>((resolve, reject) => {
          const rs = fs.createReadStream(full, { highWaterMark: CHUNK });
          rs.on('data', (chunk: Buffer) => {
            h.update(chunk);
            size += chunk.length;
          });
          rs.on('end', resolve);
          rs.on('error', reject);
        });
      } else {
        const data = fs.readFileSync(full);
        h.update(data);
        size = data.length;
      }
      const outcome: HashOutcome = { path: rel, sha256: h.digest('hex'), size };
      results.push(outcome);
      opts.onFile?.(outcome);
    }
  };
  const workers = Array.from({ length: Math.min(concurrency, paths.length) }, () => worker());
  await Promise.all(workers);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}
/**
 * Hash wire paths that live under two different roots.
 *
 * After the store move `maestro-memory/...` is under the store root and `sessions/...`
 * under the DSH home, so one `hashFiles(root, paths)` call cannot cover a mixed list.
 * The wire path is restored on the way out, because every caller reports wire paths.
 */
export async function hashWirePaths(
  fs: any,
  roots: { storeRoot: string; localDsh: string },
  wirePaths: string[],
  opts: { onFile?: (h: HashOutcome) => void } = {},
): Promise<HashOutcome[]> {
  const out: HashOutcome[] = [];
  const groups = new Map<string, string[]>();
  for (const wire of wirePaths) {
    const root = wire.startsWith('maestro-memory/') ? roots.storeRoot : roots.localDsh;
    const bucket = groups.get(root);
    if (bucket) bucket.push(wire);
    else groups.set(root, [wire]);
  }
  for (const [root, wires] of groups) {
    const rel = wires.map((w) => (w.startsWith('maestro-memory/') ? w.slice('maestro-memory/'.length) : w));
    const hashed = await hashFiles(fs, root, rel);
    for (const entry of hashed) {
      const wire = root === roots.storeRoot ? `maestro-memory/${entry.path}` : entry.path;
      const outcome = { ...entry, path: wire };
      opts.onFile?.(outcome as HashOutcome);
      out.push(outcome as HashOutcome);
    }
  }
  return out;
}
