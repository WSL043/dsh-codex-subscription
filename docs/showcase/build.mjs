import { build } from 'tsdown'

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
})
