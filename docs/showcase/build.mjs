import { build } from 'tsdown'
import path from 'node:path'

// An isolated documentation build; never load the production configuration.
await build({
  config: false,
  entry: ['docs/showcase/gallery.jsx'],
  outDir: '.artifacts/showcase',
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  clean: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  deps: { alwaysBundle: [/.*/], onlyBundle: ['react', 'react-dom', 'scheduler'] },
  plugins: [{
    name: 'showcase-host-primitives',
    resolveId(source) {
      if (source.endsWith('/client-primitives.js') || source === './client-primitives.js') {
        return path.resolve('docs/showcase/primitives.jsx')
      }
    },
  }],
})
