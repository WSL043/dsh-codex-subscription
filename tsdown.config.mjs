import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, Rolldown } from 'tsdown'

const id = 'dsh-codex-subscription'
const hostExternal = [
  '@deepseek-ai/dsh-subagent-codex',
  '@deepseek-ai/dsh-sdk-protocol',
  '@deepseek-ai/dsh-client-connection',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-tools',
  '@deepseek-ai/schemastery',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-ai/api/openai-codex-responses',
  '@earendil-works/pi-ai/providers/openai-codex',
]
const clientExternal = [
  'react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
]
const root = dirname(fileURLToPath(import.meta.url))
const clientFeatures = [
  { entry: 'src/client-sketch.jsx', fileName: 'client.sketch.js' },
  { entry: 'src/client-image-viewer.jsx', fileName: 'client.image-viewer.js' },
]

// Each feature is built independently so Rolldown cannot introduce a synchronous
// relative shared-chunk require, which DSH's module-table require cannot resolve.
function featureImports() {
  const entries = new Map(clientFeatures.map(feature => [resolve(root, feature.entry), feature]))
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  return {
    name: 'dsh-client-feature-imports',
    resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null
      const feature = entries.get(resolve(dirname(importer), source))
      return feature ? { id: `./${feature.fileName}`, external: true } : null
    },
    renderChunk(code, chunk, options) {
      if (options.format !== 'cjs') return null
      const transformed = new Rolldown.RolldownMagicString(code)
      for (const feature of clientFeatures) {
        const specifier = `./${feature.fileName}`
        // External imports may remain native import(), while internal CJS
        // imports use Rolldown's Promise/require form. External imports are not
        // always listed in chunk.dynamicImports, so inspect the emitted calls.
        const call = new RegExp(`import\\((['"])${escape(specifier)}\\1\\)|Promise\\.resolve\\(\\)\\.then\\(\\(\\)\\s*=>\\s*require\\((['"])${escape(specifier)}\\2\\)\\)`, 'gu')
        const matches = [...code.matchAll(call)]
        if (!matches.length) {
          if (chunk.dynamicImports?.some(name => name === specifier || name === feature.fileName)) {
            throw new Error(`DSH feature import has no supported generated expression: ${specifier}`)
          }
          continue
        }
        for (const match of matches) transformed.overwrite(match.index, match.index + match[0].length, `require.async(${JSON.stringify(specifier)})`)
      }
      return transformed.hasChanged() ? transformed : null
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk' && output.imports.some(name => /^\.?\/?client\..+\.js$/u.test(name))) {
          throw new Error('DSH client chunks must not synchronously import relative shared chunks')
        }
        if (output.type === 'chunk' && /\bimport\(['"]\.\/client\.[^'"]+['"]\)/u.test(output.code ?? '')) {
          throw new Error('DSH client features must use the host async chunk loader')
        }
      }
    },
  }
}

function clientBundle(entry, fileName, chunk) {
  return {
    name: `${id}/${fileName}`,
    entry: { client: entry },
    outDir: 'lib', format: 'cjs', platform: 'browser', target: 'es2022',
    dts: false, sourcemap: true, clean: false,
    deps: { neverBundle: clientExternal },
    plugins: chunk ? [] : [featureImports()],
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
    outputOptions: {
      codeSplitting: false,
      entryFileNames: fileName,
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, ${chunk ? `chunk: ${JSON.stringify(fileName)}, ` : ''}factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  }
}

export default defineConfig([
  {
    name: id,
    entry: { index: 'src/index.js' },
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: true,
    deps: { neverBundle: hostExternal },
  },
  clientBundle('src/client.jsx', 'client.js', false),
  ...clientFeatures.map(feature => clientBundle(feature.entry, feature.fileName, true)),
])
