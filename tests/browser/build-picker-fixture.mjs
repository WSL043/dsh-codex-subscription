import { build } from 'tsdown'
import { resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
const outDir = resolve('.artifacts/picker-diagnostics')
await build({ config: false, cwd: process.cwd(), entry: { picker: resolve('tests/browser/picker-diagnostics.fixture.jsx') },
  outDir, format: 'iife', platform: 'browser', target: 'es2022', clean: false, dts: false, fixedExtension: false,
  deps: { alwaysBundle: [/./] }, define: { 'process.env.NODE_ENV': JSON.stringify('production') } })
await writeFile(resolve(outDir, 'index.html'), '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="picker.iife.js"></script>')
