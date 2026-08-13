import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('client is one removable DSH settings section, not a second application shell', async () => {
  const source = await text('src/client.jsx')
  assert.match(source, /slots\.inject\(['"]settings\.section['"]/)
  assert.match(source, /id:\s*['"]codex-subscription['"]/)
  assert.match(source, /['"]\/wsl043-codex-subscription['"]/)
  assert.match(source, /login\/start/)
  assert.match(source, /login\/status/)
  assert.match(source, /['"]usage['"]/)
  assert.match(source, /['"]cache['"]/)
  assert.doesNotMatch(source, /createRoot|ReactDOM|index\.html|localStorage|sessionStorage|accessToken|refreshToken/)
})

test('cache UI keeps server token reuse, transport continuation, and prefix stability distinct', async () => {
  const source = await text('src/client.jsx')
  for (const key of ['serverCache', 'transport', 'prefix', 'hitPercent', 'deltaPercent', 'changes']) {
    assert.match(source, new RegExp(key))
  }
  assert.match(source, /measured|host start|主机启动/u)
  assert.doesNotMatch(source, /98%|guaranteed|保证命中/u)
})

test('cache metrics respond to the settings content width instead of the viewport', async () => {
  const source = await text('src/client.jsx')
  assert.match(source, /\.wslCodex\{[^}]*container-type:\s*inline-size/)
  assert.match(source, /@container\s*\(max-width:\s*560px\)\{\.wslCodexMetrics\{grid-template-columns:\s*1fr\}\}/)
})

test('build emits host entries and a DSH module-loader client', async () => {
  const config = await text('tsdown.config.mjs')
  assert.match(config, /src\/index\.js/)
  assert.match(config, /src\/boundary\.js/)
  assert.match(config, /src\/client\.jsx/)
  assert.match(config, /window\.__ModuleLoader__\.load/)
  assert.match(config, /@wsl043\/dsh-codex-subscription/)
})
