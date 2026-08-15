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

test('the English settings navigation label fits the DSH sidebar', async () => {
  const source = await text('src/client.jsx')
  assert.match(source, /const en = \{[\s\S]*?nav:\s*['"]Codex['"][\s\S]*?title:\s*['"]Codex subscription['"]/u)
})

test('beta quota badge uses the public composer slot before the model selector', async () => {
  const [client, host, contract] = await Promise.all([
    text('src/client.jsx'), text('src/index.js'), text('src/settings-contract.js'),
  ])
  assert.match(client, /slots\.inject\(['"]conversation\.input\.right['"]/u)
  assert.match(client, /name:\s*['"]conversation\.input\.right['"]/u)
  assert.match(client, /id:\s*['"]codex-subscription-quota['"]/u)
  assert.match(client, /modelDirectories/u)
  assert.doesNotMatch(client, /sidebar\.footer\.action/u)
  assert.match(client, /preferences\/status/u)
  assert.match(client, /preferences\/update/u)
  assert.match(client, /QUICK_QUOTA_FIELD/u)
  assert.match(client, /role=['"]switch['"]/u)
  assert.match(client, /aria-checked=/u)
  assert.match(client, /role=['"]status['"]/u)
  assert.match(client, /preferenceSnapshot\.status === ['"]ready['"] && preferenceSnapshot\.visible/u)
  assert.doesNotMatch(client, /onPointerDown|onMouseDown|onContextMenu/u)
  assert.doesNotMatch(client, /localStorage|sessionStorage/u)
  assert.match(host, /export const inject = \[[^\]]*['"]settings['"]/u)
  assert.match(host, /ctx\.settings\.register/u)
  assert.match(host, /settings\.update/u)
  assert.match(host, /QUICK_QUOTA_FIELD/u)
  assert.match(contract, /quickQuotaVisible/u)
  assert.match(contract, /DEFAULT_QUICK_QUOTA_VISIBLE\s*=\s*false/u)
  assert.match(contract, /DEFAULT_SEARCH_PROVIDER\s*=\s*SEARCH_PROVIDER_DSH/u)
})

test('composer quota is neutral and the detailed quota grid is compact', async () => {
  const source = await text('src/client.jsx')
  const composerRule = source.match(/\.codexComposerQuota\{[^}]+\}/u)?.[0]
  assert.ok(composerRule, 'missing composer quota base rule')
  assert.match(composerRule, /var\(--dsw-alias-label-/u)
  assert.match(composerRule, /display:\s*inline-flex/u)
  assert.match(composerRule, /align-items:\s*center/u)
  assert.match(composerRule, /height:\s*28px/u)
  assert.match(composerRule, /margin-right:\s*-4px/u)
  assert.match(composerRule, /font-size:\s*12px/u)
  assert.match(composerRule, /line-height:\s*20px/u)
  assert.doesNotMatch(composerRule, /brand|success|error|#[0-9a-f]{3,8}|rgb\(/iu)
  assert.match(source, /\.codexSubscriptionUsageCard\{[^}]*padding:\s*12px 14px[^}]*gap:\s*9px/u)
  assert.match(source, /\.codexSubscriptionLimit\{[^}]*padding:\s*9px 12px[^}]*gap:\s*6px/u)
  assert.match(source, /\.codexSubscriptionLimit progress\{[^}]*height:\s*4px/u)
  assert.doesNotMatch(source, /fill\(t\(['"]used['"]\),\s*\{\s*value:\s*percent\(window\.usedPercent\)/u)
})

test('settings offer explicit DSH or Codex search and mark quick quota as beta', async () => {
  const source = await text('src/client.jsx')
  assert.match(source, /searchProvider/u)
  assert.match(source, /searchDsh/u)
  assert.match(source, /searchCodex/u)
  assert.match(source, /role=['"]radiogroup['"]/u)
  assert.match(source, /type=['"]radio['"]/u)
  assert.match(source, /className=['"]codexSubscriptionSearchInput['"]/u)
  assert.match(source, /\.codexSubscriptionSearchInput\{[^}]*width:\s*14px[^}]*height:\s*14px/u)
  assert.doesNotMatch(source, /\.codexSubscriptionSearchChoice input\{[^}]*opacity:\s*0/u)
  assert.doesNotMatch(source, /role=['"]radio['"]/u)
  assert.match(source, /preferenceFailed/u)
  assert.match(source, /snapshot\.error/u)
  assert.match(source, /quickQuotaBeta/u)
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

test('settings keep only actionable account, search, quick quota, and usage copy', async () => {
  const source = await text('src/client.jsx')
  assert.doesNotMatch(source, /CacheDiagnostics|Technical diagnostics|技术诊断|codexSubscriptionDiagnostics|codexSubscriptionSafety/u)
  assert.doesNotMatch(source, /routePolicy|noFallback|searchIntro|quickQuotaHint|usageIntro|codexSubscriptionIntro|codexSubscriptionRoutePolicy/u)
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
