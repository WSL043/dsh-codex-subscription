import assert from 'node:assert/strict'
import test from 'node:test'
import { createDiagnosticLog, formatLogLine, sanitizeLogText } from '../src/diagnostic-log.js'

test('the log keeps no token, email, query string or user path', () => {
  const text = sanitizeLogText('failed Bearer abc.def.ghi for wang@example.com at https://chatgpt.com/backend-api/x?token=SECRET&a=1 in C:/Users/Omo/AppData/f.js token=zzz eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig')
  assert.doesNotMatch(text, /abc\.def|wang@|SECRET|Omo|zzz|eyJ/u)
  assert.match(text, /https:\/\/chatgpt\.com\/backend-api\/x(?!\?)/u)
})

test('levels, repeats and the formatted line', () => {
  let time = Date.UTC(2026, 9, 18, 1, 2, 3)
  const log = createDiagnosticLog({ now: () => time })
  log.info('plugin', 'loaded')
  log.error('image', 'request failed: HTTP 401')
  log.error('image', 'request failed: HTTP 401')
  log.log('nonsense', 'x', 'y')
  const { entries } = log.snapshot()
  assert.deepEqual(entries.map(entry => entry.level), ['info', 'error'])
  assert.equal(entries[1].count, 2)
  assert.equal(formatLogLine(entries[1]), '2026-10-18 01:02:03 ERROR [image] request failed: HTTP 401 (x2)')
})

test('the log is bounded', () => {
  const log = createDiagnosticLog({ limit: 5 })
  for (let index = 0; index < 20; index++) log.warn('a', `line ${index}`)
  const { entries, dropped } = log.snapshot()
  assert.equal(entries.length, 5)
  assert.equal(entries.at(-1).message, 'line 19')
  assert.ok(dropped > 0)
})
