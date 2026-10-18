// Headless Chrome over raw CDP (no playwright): one page, JS evaluation, mouse/text input,
// screenshots, and a collected list of console errors and uncaught exceptions.
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freePort } from './dsh-host.mjs'

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

export async function launchChrome({ width = 1280, height = 800 } = {}) {
  const chrome = candidates.find(path => existsSync(path))
  if (chrome === undefined) throw new Error('Chrome not found; set CHROME_PATH')
  const port = await freePort()
  const profile = mkdtempSync(join(tmpdir(), 'ui-smoke-chrome-'))
  const child = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' })
  for (let index = 0; ; index++) {
    try { await fetch(`http://127.0.0.1:${port}/json/version`); break } catch { if (index > 60) throw new Error('Chrome did not start'); await new Promise(done => setTimeout(done, 200)) }
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise(done => ws.addEventListener('open', done, { once: true }))
  let id = 0
  const waiting = new Map()
  const problems = []
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id !== undefined && waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); return }
    if (message.method === 'Runtime.exceptionThrown') {
      const detail = message.params.exceptionDetails
      problems.push({ kind: 'exception', text: String(detail.exception?.description ?? detail.text).split('\n')[0], url: detail.url ?? detail.stackTrace?.callFrames?.[0]?.url ?? '', at: Date.now() })
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ').split('\n')[0]
      problems.push({ kind: 'console.error', text, url: message.params.stackTrace?.callFrames?.[0]?.url ?? '', at: Date.now() })
    }
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id
    waiting.set(n, message => message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result))
    ws.send(JSON.stringify({ id: n, method, params }))
  })
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  const wait = ms => new Promise(done => setTimeout(done, ms))
  const page = {
    send, wait, problems,
    async goto(url) { await send('Page.navigate', { url }); await wait(4000) },
    async eval(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
      return result.result.value
    },
    async until(expression, timeout = 15_000, label = expression) {
      const end = Date.now() + timeout
      for (;;) {
        let value
        try { value = await page.eval(expression) } catch {}
        if (value) return value
        if (Date.now() > end) throw new Error(`timed out waiting for ${label}`)
        await wait(250)
      }
    },
    async click(x, y) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }) },
    /** Click the centre of the first element matching a selector whose text matches `text` (optional). */
    async clickElement(selector, text) {
      const point = await page.eval(`(() => { const want = ${JSON.stringify(text ?? null)}; const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(n => want === null || (n.textContent || '').trim() === want || (n.getAttribute('aria-label') || '') === want); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2} })()`)
      if (point === null) throw new Error(`no element ${selector}${text ? ` "${text}"` : ''}`)
      await page.click(point.x, point.y)
    },
    async key(key, code, keyCode) { for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode }) },
    async shot(file) { const result = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(result.data, 'base64')) },
    async close() {
      try { ws.close() } catch {}
      try { child.kill() } catch {}
      await wait(500)
      try { rmSync(profile, { recursive: true, force: true }) } catch {}
    },
  }
  return page
}
