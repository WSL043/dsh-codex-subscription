import { defineConfig } from 'tsdown'

const id = '@wsl043/dsh-codex-subscription'
const hostExternal = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-credentials',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-llm-pi-ai',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-ai/api/openai-codex-responses',
  '@earendil-works/pi-ai/providers/openai-codex',
]
const clientExternal = [
  'react', 'react/jsx-runtime', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
]

export default defineConfig([
  {
    name: id,
    entry: { index: 'src/index.js', boundary: 'src/boundary.js' },
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: true,
    deps: { neverBundle: hostExternal },
  },
  {
    name: `${id}/client`,
    entry: { client: 'src/client.jsx' },
    outDir: 'lib', format: 'cjs', platform: 'browser', target: 'es2022',
    dts: false, sourcemap: true, clean: false,
    deps: { neverBundle: clientExternal },
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
