// Bundle every client surface this package owns into the DSH browser loader
// shape: window.__ModuleLoader__.load({ id, factory: (require) => ... }).
//
// One bundle, one id, one entry point (src/client/index.tsx): the entry
// decides which surfaces register and in what order, so the per-module build
// scripts this replaces are gone rather than kept as three ways to produce one
// artifact. react and the DSH platform modules stay external and resolve from
// the host's module table at runtime.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(root, 'lib/client.js')
// The loader id is the manifest name, read rather than written out. This script
// is the one the sibling packages copied, and a copy that kept a written-out id
// shipped that sibling's name instead of its own: the bundle registered under an
// id the host never asked for, which drops the entry at boot with no error
// naming the cause.
const id = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).name

const result = await build({
  entryPoints: [resolve(root, 'src/client/index.tsx')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['chrome100'],
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  jsx: 'automatic',
  write: false,
  minify: process.env.NODE_ENV === 'production',
  legalComments: 'none',
})

const bundled = result.outputFiles?.[0]?.text
if (!bundled) throw new Error('esbuild did not produce a client bundle')

const wrapped = `window.__ModuleLoader__.load({
  id: '${id}',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
${bundled}
    return module.exports;
  }
});
`

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, wrapped, 'utf8')
console.log(`client bundle written: ${outputPath} (${bundled.length} bytes)`)