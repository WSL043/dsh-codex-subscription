import assert from 'node:assert/strict'
import test from 'node:test'

import { compactDiagnostic } from '../src/diagnostic-compact.js'

test('the copied report keeps conclusions and drops counters, and stays small', () => {
  const report = {
    version: '2.3.0', generatedAt: '2026-09-30T00:00:00.000Z', account: { status: 'signed-in' },
    client: { version: '2.3.0' }, runtime: { dsh: '0.2.0-rc.2', platform: 'win32', arch: 'x64' }, catalog: { source: 'online', refresh: 'ok' },
    configuration: { speedMode: 'fast' },
    requests: { total: 999 }, requestHistory: { events: Array.from({ length: 200 }, (_, i) => ({ area: 'model', status: 'ok', observedAt: i })) },
    summary: { findings: [{ code: 'recent-failure', severity: 'warning', next: 'reproduce', evidence: [{ action: 'codex_image_generate', source: 'tool', observedAt: 1790695144701 }] }] },
    inspection: { capabilities: [
      { id: 'images', reason: 'tool-registered', readiness: 'pass', latest: { action: 'codex_image_generate', status: 'failed' } },
      { id: 'sketch', reason: 'disabled-or-host-owned', readiness: 'not-applicable' },
      { id: 'search', reason: 'no-readiness-check', readiness: 'unknown' },
    ] },
  }
  const compact = compactDiagnostic(report)
  assert.equal(compact.plugin, '2.3.0')
  assert.equal(compact.dsh, '0.2.0-rc.2', 'the DSH field is the host release, not the plugin client')
  assert.equal('pluginClient' in compact, false)
  assert.equal(compact.platform, 'win32-x64')
  assert.equal(compact.findings[0].failures[0].action, 'codex_image_generate')
  assert.deepEqual(compact.capabilities.map(item => item.id), ['images', 'search'])
  assert.equal(compact.capabilities[1].latest, 'not-verified')
  assert.equal('requestHistory' in compact, false)
  assert.ok(JSON.stringify(compact).length < 1200)
})
