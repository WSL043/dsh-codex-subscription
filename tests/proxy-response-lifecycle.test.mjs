import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('proxy response faults stay inside one request and the next SSE and health request survive in an isolated process', { timeout: 10_000 }, () => {
  const child = spawnSync(process.execPath, ['--unhandled-rejections=strict',
    fileURLToPath(new URL('./fixtures/proxy-response-lifecycle-child.mjs', import.meta.url))],
  { encoding: 'utf8', timeout: 8_000, maxBuffer: 256 * 1024, windowsHide: true })
  assert.equal(child.error, undefined, child.error?.message)
  assert.equal(child.status, 0, child.stderr || child.stdout)
  assert.equal(child.signal, null)
  const result = JSON.parse(child.stdout.trim())
  assert.equal(result.passed, true)
  assert.equal(result.globalExceptionHandler, false)
  assert.equal(result.replay, false)
  assert.equal(result.openSocketsBeforeCleanup, 0)
  assert.deepEqual(result.checked.map(value => value.after), [
    'completed-late-events', 'reset', 'abort', 'cancel-Error', 'pending-cancel-late-events',
  ])
})
