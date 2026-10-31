import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { selectChannelCandidate, baselineHold, registryJson } from '../scripts/upstream-compatibility.mjs'
import { planCompatibilityRecheck } from '../scripts/prepare-compat-release.mjs'
const published = { version: '3.2.2', peerDependencies: { '@deepseek-ai/dsh-llm': '0.2.1-rc.4 || 0.2.1-rc.5 || 0.2.2-alpha.2' } }
const compat = { latestTested: '0.2.1-rc.5', supported: ['0.2.1-rc.5'], previews: ['0.2.2-alpha.2'] }
test('official RC channels deduplicate and take priority over alpha; known channels do nothing', () => {
  const result = selectChannelCandidate({ latest: '0.2.1-rc.6', next: '0.2.1-rc.6', alpha: '0.2.2-alpha.3' }, published, compat)
  assert.equal(result.version, '0.2.1-rc.6'); assert.equal(result.stable, true)
  assert.equal(selectChannelCandidate({ next: '0.2.1-rc.5' }, published, compat, { requested: '0.2.1-rc.5' }), undefined)
  assert.equal(selectChannelCandidate({ latest: '0.2.1-rc.5', next: '0.2.1-rc.5', alpha: '0.2.2-alpha.2' }, published, compat), undefined)
})
test('main-only compatibility never disguises an unpublished fix as an available npm version', async () => {
  const main = { ...compat, latestTested: '0.2.1-rc.6', supported: [...compat.supported, '0.2.1-rc.6'] }
  assert.equal(selectChannelCandidate({ next: '0.2.1-rc.6' }, published, main).version, '0.2.1-rc.6')
  assert.match(baselineHold(published, { version: '3.2.3' }, []), /not yet on npm/u)
  assert.match(baselineHold(published, published, ['src/business.js']), /unreleased/u)
  assert.equal(baselineHold(published, published, []), undefined)
  const automation = ['.github/workflows/upstream-compatibility.yml', '.github/workflows/compatibility-autopilot.yml', 'scripts/upstream-compatibility.mjs', 'tests/upstream-compatibility.test.mjs', 'tests/release-contract.test.mjs']
  assert.equal(baselineHold(published, published, automation), undefined)
  for (const file of ['src/new-feature.js', 'lib/index.js', 'README.md', 'package.json', 'pnpm-lock.yaml', 'compatibility.json', 'dsh-codex.ps1', 'new-unknown.txt']) {
    assert.match(baselineHold(published, published, [...automation, file]), /unreleased/u)
  }
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  for (const file of automation) assert.ok(!manifest.files.some(entry => file === entry || file.startsWith(entry + '/')))
})
test('channel rollback is ignored and alpha is never automatically classified stable', () => {
  assert.equal(selectChannelCandidate({ next: '0.2.1-rc.3' }, published, compat), undefined)
  assert.equal(selectChannelCandidate({ next: '0.2.2-alpha.3' }, published, compat).stable, false)
  assert.throws(() => selectChannelCandidate({}, published, compat, { requested: '0.2.1-rc.6' }), /official npm channel/u)
  assert.throws(() => selectChannelCandidate({}, published, compat, { requested: '$(echo bad)' }), /Invalid/u)
})
test('dry-run may recheck a current channel without declaring a fictional future release', () => {
  assert.equal(selectChannelCandidate({ next: '0.2.1-rc.5' }, published, compat, { requested: '0.2.1-rc.5', dryRun: true }).recheck, true)
  assert.equal(planCompatibilityRecheck({ manifest: published, compatibility: compat }, '0.2.1-rc.5').pluginVersion, '3.2.3')
  assert.throws(() => planCompatibilityRecheck({ manifest: published, compatibility: compat }, '0.2.1-rc.99'), /untested/u)
})
test('registry failures retry transient requests only and never become compatibility success', async () => {
  let calls = 0
  assert.deepEqual(await registryJson('fixture', async () => { calls++; if (calls < 3) throw new Error('reset'); return { ok: true, json: async () => ({ version: 'ok' }) } }, async () => {}), { version: 'ok' })
  assert.equal(calls, 3); calls = 0
  await assert.rejects(registryJson('fixture', async () => { calls++; return { ok: false, status: 404 } }, async () => {}), /404/u)
  assert.equal(calls, 1)
})
test('dry-run and failed gates cannot reach main/tag/npm publication', async () => {
  const source = await readFile(new URL('../.github/workflows/compatibility-autopilot.yml', import.meta.url), 'utf8')
  const require = createRequire(import.meta.url)
  const { parse } = createRequire(require.resolve('@deepseek-ai/dsh-settings/package.json'))('yaml')
  const workflow = parse(source)
  assert.equal(workflow.on.schedule[0].cron, '23 * * * *')
  assert.deepEqual(workflow.on.repository_dispatch.types, ['dsh-upstream-release'])
  const jobs = workflow.jobs
  assert.deepEqual(workflow.on.workflow_run.workflows, ['Stale reporter follow-up', 'Risk-based CI'])
  assert.deepEqual(workflow.on.workflow_run.types, ['completed'])
  assert.match(jobs.detect.if, /conclusion == 'success'/u)
  assert.match(jobs.detect.if, /head_branch == 'main'/u)
  assert.match(jobs.detect.if, /head_repository.full_name == github.repository/u)
  assert.equal(jobs.detect.permissions, undefined)
  assert.equal(jobs.promote.permissions['contents'], 'write')
  for (const step of jobs.promote.steps.filter(s => /Refuse races|Commit accepted/u.test(s.name ?? ''))) assert.equal(step.if, 'inputs.dry_run != true')
  const dispatch = jobs.promote.steps.find(s => /Dispatch and await/u.test(s.name ?? ''))
  assert.equal(dispatch.env.DRY_RUN, '${{ inputs.dry_run }}')
  const dryBranch = dispatch.run.slice(dispatch.run.indexOf('if [['), dispatch.run.indexOf('\nelse\n'))
  assert.match(dryBranch, /verify_only=true/u); assert.doesNotMatch(dryBranch, /release_kind=compatibility|git push/u)
  assert.match(jobs.promote.if, /windows-acceptance.result == 'success'/u)
  assert.match(jobs.promote.if, /stable == 'true'/u)
  assert.match(jobs.report.if, /dry_run != true/u)
  assert.match(jobs.report.if, /failure/u)
  assert.match(jobs.report.if, /blocked == 'true'/u)
})
