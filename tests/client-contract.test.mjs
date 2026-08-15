import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const text = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('client is one removable DSH settings section, not a second application shell', async () => {
  const source = await text('src/client.jsx')
  assert.match(source, /slots\.inject\(['"]settings\.section['"]/)
  assert.match(source, /id:\s*['"]codex-subscription['"]/)
  assert.match(source, /['"]\/codex-subscription['"]/) // RPC channel
  assert.doesNotMatch(source, /wsl043/iu)
  assert.match(source, /login\/start/)
  assert.match(source, /login\/status/)
  assert.match(source, /['"]usage['"]/)
  assert.doesNotMatch(source, /['"]cache['"]|CacheDiagnostics|CodexCacheTelemetry/)
  assert.doesNotMatch(source, /createRoot|ReactDOM|index\.html|localStorage|sessionStorage|accessToken|refreshToken/)
})

test('quota is the primary surface with reset, freshness, loading, and empty-state semantics', async () => {
  const source = await text('src/client.jsx')
  for (const token of ['resetsAt', 'fetchedAt', 'usageLoading', 'usageEmpty', 'usageUpdated', 'resetCredits']) {
    assert.match(source, new RegExp(token))
  }
  assert.match(source, /<time\b[^>]*dateTime=/u)
  assert.match(source, /<progress\b[^>]*value=\{window\.remainingPercent\}/u)
  assert.match(source, /::-webkit-progress-value/u)
  assert.match(source, /var\(--dsw-alias-brand-primary,\s*#3964fe\)/u)
  assert.match(source, /aria-live=['"]polite['"]/u)
  assert.match(source, /useRef\(0\)/u)
  assert.match(source, /const visibleUsage = signedIn \? usage : undefined/u)
  assert.match(source, /windowWeekly/u)
  assert.match(source, /windowFiveHours/u)
  assert.match(source, /isApproximateWindow/u)
  assert.doesNotMatch(source, /codex_bengalfox|GPT-5\.3-Codex-Spark/u, 'model quota labels must come from the backend')
  assert.match(source, /refreshing/u)
  assert.match(source, /className=['"]codexSubscriptionRefresh['"]/u)
  assert.match(source, /\.codexSubscriptionRefresh\{[^}]*white-space:\s*nowrap/u)
  assert.match(source, /monthlyCreditLimit/u)
  assert.match(source, /creditsBalance/u)
  assert.match(source, /creditsNote/u)
  assert.match(source, /额外 Credits 余额/u)
  assert.match(source, /Credits 月度消费上限/u)
  assert.match(source, /visibleUsage\?\.credits === undefined && visibleUsage\?\.individualLimit === undefined/u)
  assert.match(source, /individualLimit\.used/u)
  assert.doesNotMatch(source, /individualLimit\.remaining(?!Percent)/u)
})

test('settings omit nonessential cache diagnostics and render route policy as neutral copy', async () => {
  const source = await text('src/client.jsx')
  assert.doesNotMatch(source, /CacheDiagnostics|Technical diagnostics|技术诊断|codexSubscriptionDiagnostics|codexSubscriptionSafety/u)
  assert.match(source, /codexSubscriptionRoutePolicy/u)
  assert.doesNotMatch(source, /\.codexSubscriptionRoutePolicy\{[^}]*state-success/u)
})

test('build emits host entries and a DSH module-loader client', async () => {
  const config = await text('tsdown.config.mjs')
  assert.match(config, /src\/index\.js/)
  assert.doesNotMatch(config, /src\/boundary\.js/)
  assert.match(config, /src\/client\.jsx/)
  assert.match(config, /window\.__ModuleLoader__\.load/)
  assert.match(config, /['"]dsh-codex-subscription['"]/)
  assert.doesNotMatch(config, /wsl043/iu)
})
