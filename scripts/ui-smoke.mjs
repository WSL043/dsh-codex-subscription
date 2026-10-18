#!/usr/bin/env node
// Live UI smoke test of the packed plugin on one real DSH version (it never calls the model):
//   node scripts/ui-smoke.mjs --dsh-version 0.2.1-rc.2 [--credentials <home>] [--keep] [--shots <dir>] [--url <running dsh web address>]
// It installs that DSH from npm into a throwaway dir, adds this checkout's packed plugin with DSH's
// own `plugin add`, starts `dsh web` on a free port with copied signed-in credentials, then drives
// headless Chrome over CDP and prints PASS/FAIL per check. See docs/ui-smoke.md.
import { mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchChrome } from './support/cdp.mjs'
import { startHost } from './support/dsh-host.mjs'
import { registeredSlotNames } from './support/slot-catalog.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argument = name => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1] }
const dshVersion = argument('--dsh-version')
const attach = argument('--url')
if (dshVersion === undefined && attach === undefined) {
  console.error('usage: node scripts/ui-smoke.mjs --dsh-version <version> [--credentials <home>] [--keep] [--shots <dir>]')
  process.exit(2)
}
const credentialsHome = argument('--credentials') ?? join(process.env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'dsh-codex-acceptance', 'home')
const shots = argument('--shots')
if (shots !== undefined) mkdirSync(shots, { recursive: true })

// Words the UI may show, from the plugin's own two locales (and the picker rows it adds to DSH's menu).
const localeText = readFileSync(join(root, 'src', 'client-locales.js'), 'utf8')
const words = key => [...localeText.matchAll(new RegExp(`\\b${key}: '([^']*)'`, 'gu'))].map(match => match[1])
const TABS = ['start', 'models', 'tools', 'create', 'more']
const tabWords = Object.fromEntries(TABS.map(tab => [tab, words(`settingsTab_${tab}`)]))
const RAW_KEY = /^[a-z]+[A-Z][A-Za-z]+$/u
const NOT_KEYS = new Set(['iPhone', 'iPad', 'iOS', 'macOS', 'iCloud', 'eSIM', 'mDNS'])

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : `  -- ${detail}`}`)
}
const check = async (name, body) => {
  try {
    const outcome = await body()
    if (outcome === true || outcome === undefined) record(name, true)
    else if (typeof outcome === 'string') record(name, false, outcome)
    else record(name, outcome.ok, outcome.detail)
  } catch (error) { record(name, false, String(error.message ?? error).split('\n')[0]) }
}

let host
let page
const exit = async code => {
  try { await page?.close() } catch {}
  try { host?.stop() } catch {}
  process.exit(code)
}
process.on('SIGINT', () => { void exit(130) })

try {
  let address = attach
  if (address === undefined) {
    host = await startHost({ root, dshVersion, credentialsHome, keep: process.argv.includes('--keep') })
    address = host.address
  }
  console.log(`\n# drive the page (DSH ${dshVersion ?? 'attached'})`)
  page = await launchChrome()
  const shot = async name => { if (shots !== undefined) await page.shot(join(shots, `${name}.png`)).catch(() => {}) }
  const rpc = (method, payload) => page.eval(`fetch('/api/codex-subscription/${method}', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method: 'codex-subscription/${method}', payload: ${JSON.stringify(payload)} }) }).then(response => response.json()).then(json => json.result?.ok === true ? 'ok' : JSON.stringify(json).slice(0, 200))`)
  // Visible element whose own text equals one of `texts` (or matches the regex source): its centre, or null.
  const textPoint = (texts, scope = 'document') => page.eval(`(() => {
    const wanted = ${JSON.stringify(texts)}
    const root = ${scope}
    if (!root) return null
    const hit = [...root.querySelectorAll('*')].find(node => {
      if (node.children.length > 0) return false
      const rect = node.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && wanted.includes((node.textContent || '').trim())
    })
    if (!hit) return null
    hit.scrollIntoView({ block: 'center' })
    const rect = hit.getBoundingClientRect()
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  })()`)
  const clickText = async (texts, scope) => {
    const point = await textPoint(texts, scope)
    if (point === null) throw new Error(`no visible "${texts[0]}"`)
    await page.click(point.x, point.y)
  }

  // ---- a) page load -------------------------------------------------------------------------------
  await page.goto(address)
  await check('a) page loads without the plugin-load failure screen', async () => {
    await page.until(`!!document.querySelector('[data-slot="conversation.composer.bar"]') || /Failed to load plugins/.test(document.body.innerText)`, 45_000, 'the composer')
    const failure = await page.eval(`(() => { const text = document.body.innerText; const at = text.indexOf('Failed to load plugins'); return at < 0 ? null : text.slice(at, at + 300).replace(/\\s+/g, ' ') })()`)
    if (failure !== null) return failure
    const log = host?.serverLog() ?? ''
    if (/skipping profile bundle/iu.test(log)) return 'the host log says a profile bundle was skipped'
    await shot('01-loaded')
  })

  // ---- f) slot contract (runs early: it only needs the page's slot registry) -----------------------
  await check('f) every slot name the plugin registers is declared by the host', async () => {
    const names = registeredSlotNames(root)
    const specs = await page.eval(`(() => {
      const container = document.getElementById('root') || document.body.firstElementChild
      const key = Object.keys(container).find(name => name.startsWith('__reactContainer'))
      const seen = new Set(); const stack = [container[key]]
      let registry
      while (stack.length > 0 && registry === undefined) {
        const fiber = stack.pop()
        if (!fiber || seen.has(fiber)) continue
        seen.add(fiber)
        const value = fiber.memoizedProps && typeof fiber.memoizedProps === 'object' ? fiber.memoizedProps.value : undefined
        if (value && typeof value === 'object' && typeof value.specOf === 'function') registry = value
        if (fiber.child) stack.push(fiber.child)
        if (fiber.sibling) stack.push(fiber.sibling)
      }
      if (!registry) return null
      const out = {}
      for (const name of ${JSON.stringify(names)}) out[name] = registry.specOf(name) ?? null
      return out
    })()`)
    if (specs === null) return 'the host slot registry is not reachable from the page (specOf provider not found)'
    const undeclared = names.filter(name => specs[name] === null)
    console.log(`      ${names.length} slot names registered: ${names.map(name => `${name}${specs[name] === null ? ' (UNDECLARED)' : `=${specs[name].kind}/${specs[name].scope}`}`).join(', ')}`)
    if (undeclared.length > 0) return `undeclared by the host: ${undeclared.join(', ')}`
  })

  // Settings that the composer checks need: quota readout as percent, voice button on.
  await check('   setup: quota readout = percent and voice call = on', async () => {
    const outcome = await rpc('preferences/update', { quickQuotaMode: 'percent', voiceCall: 'on' })
    if (outcome !== 'ok') return `preferences/update said ${outcome}`
    await page.goto(address)
    await page.until(`!!document.querySelector('[data-slot="conversation.composer.bar"]')`, 30_000, 'the composer')
  })

  // ---- b) settings tabs ---------------------------------------------------------------------------
  const navWords = words('nav')
  await check('b) settings -> Codex subscription: five tabs, no raw i18n keys, no horizontal overflow', async () => {
    await page.eval(`document.querySelector('[data-slot="settings.launcher"] button').click()`)
    await page.wait(600)
    await page.eval(`document.querySelector('[role=menuitem]').click()`)
    await page.until(`!!document.querySelector('[data-slot="settings.section"]')`, 15_000, 'the settings dialog')
    await clickText(navWords)
    await page.until(`!!document.querySelector('.codexSettingsTabs [role=tab]')`, 15_000, 'our settings tabs')
    const tabs = await page.eval(`[...document.querySelectorAll('.codexSettingsTabs [role=tab]')].map(tab => tab.textContent.trim())`)
    const languages = [0, 1].map(index => TABS.map(tab => tabWords[tab][index]))
    if (!languages.some(expected => JSON.stringify(expected) === JSON.stringify(tabs))) return `tab names are ${JSON.stringify(tabs)}, expected ${JSON.stringify(languages[0])} or ${JSON.stringify(languages[1])}`
    const problems = []
    for (const [index, tab] of TABS.entries()) {
      await page.eval(`document.querySelectorAll('.codexSettingsTabs [role=tab]')[${index}].click()`)
      await page.wait(700)
      await shot(`02-settings-${tab}`)
      const report = await page.eval(`(() => {
        const panel = document.querySelector('[role=tabpanel]:not([hidden])')
        if (!panel) return { missing: true }
        const lines = panel.innerText.split('\\n').map(line => line.trim()).filter(Boolean)
        const attributes = [...panel.querySelectorAll('[aria-label],[title],[placeholder]')].flatMap(node => ['aria-label', 'title', 'placeholder'].map(name => node.getAttribute(name)).filter(Boolean))
        const scroller = (() => { let node = panel.parentElement; while (node && node !== document.body) { if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node; node = node.parentElement } return null })()
        const tabs = document.querySelector('.codexSettingsTabs')
        return {
          lines: [...lines, ...attributes],
          panelOverflow: panel.scrollWidth - panel.clientWidth,
          scrollerOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
          tabsOverflow: tabs.scrollWidth - tabs.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
        }
      })()`)
      if (report.missing) { problems.push(`${tab}: no visible panel`); continue }
      const keys = report.lines.filter(line => RAW_KEY.test(line) && !NOT_KEYS.has(line))
      if (keys.length > 0) problems.push(`${tab}: raw i18n keys ${[...new Set(keys)].slice(0, 6).join(', ')}`)
      if (report.lines.length < 2) problems.push(`${tab}: the panel is empty`)
      for (const [label, value] of Object.entries({ panel: report.panelOverflow, scroller: report.scrollerOverflow, tabs: report.tabsOverflow, page: report.pageOverflow })) {
        if (value > 1) problems.push(`${tab}: horizontal overflow of the ${label} by ${value}px`)
      }
    }
    if (problems.length > 0) return problems.join('; ')
  })
  // close settings
  await page.eval(`(document.querySelector('[data-slot="settings.close"]') || document.querySelector('[role=dialog] button[aria-label]'))?.click()`).catch(() => {})
  await page.wait(800)
  await page.eval(`document.querySelector('[role=dialog]') && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`).catch(() => {})
  await page.wait(500)

  // ---- d) model picker ----------------------------------------------------------------------------
  const modelLabel = words('modelLabel'); const effortLabel = words('effortLabel'); const speedLabel = words('speedTitle')
  await check('d) our model picker is mounted (.codexModelSelectTrigger)', async () => {
    await page.until(`!!document.querySelector('.codexModelSelectTrigger')`, 20_000, '.codexModelSelectTrigger')
    return (await page.eval(`document.querySelectorAll('[data-slot="conversation.input.model"] button').length`)) > 0 ? true : 'the model slot has no button'
  })
  await check('d) picker offers a Codex model, and its rows are Model / Reasoning effort / Speed', async () => {
    const popupOpen = async () => { await page.eval(`document.querySelector('.codexModelSelectTrigger').click()`); await page.wait(900) }
    const triggerText = () => page.eval(`document.querySelector('.codexModelSelectTrigger').innerText`)
    if (!/GPT-/u.test(await triggerText())) {
      await popupOpen()
      await clickText(modelLabel)              // open the model list
      await page.wait(900)
      const point = await page.eval(`(() => {
        const hit = [...document.querySelectorAll('*')].find(node => node.children.length === 0 && /^GPT-\\d/.test((node.textContent || '').trim()) && !node.closest('.codexModelSelectTrigger') && node.getBoundingClientRect().width > 0)
        if (!hit) return null
        const rect = hit.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      })()`)
      if (point === null) return 'no GPT model in the list (is the copied account signed in?)'
      await page.click(point.x, point.y)
      await page.until(`/GPT-/.test(document.querySelector('.codexModelSelectTrigger')?.innerText || '')`, 10_000, 'the Codex model to be selected')
      await page.wait(800)
    }
    await popupOpen()
    await shot('03-model-picker')
    const rows = await page.eval(`(() => {
      const texts = [...document.querySelectorAll('*')].filter(node => node.children.length === 0 && node.getBoundingClientRect().width > 0).map(node => (node.textContent || '').trim())
      return texts
    })()`)
    const missing = [['Model', modelLabel], ['Reasoning effort', effortLabel], ['Speed', speedLabel]].filter(([, options]) => !options.some(option => rows.includes(option))).map(([label]) => label)
    await page.key('Escape', 'Escape', 27)
    await page.wait(400)
    if (missing.length > 0) return `missing picker rows: ${missing.join(', ')}; the Speed tier row mounts only when the host renders our picker`
  })

  // ---- c) composer slots --------------------------------------------------------------------------
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`).catch(() => {})
  await page.wait(500)
  await check('c) composer right slot has children and shows the quota readout (quota = percent)', async () => {
    await page.until(`document.querySelector('[data-slot="conversation.input.right"]')?.children.length > 0`, 10_000, 'children in conversation.input.right')
    const readout = await page.until(`!!document.querySelector('[data-slot="conversation.input.right"] .codexComposerQuota')`, 20_000, 'the .codexComposerQuota readout').then(() => true, () => false)
    await shot('04-composer')
    if (!readout) return 'the slot mounted but the quota readout (.codexComposerQuota) never appeared (no quota data for the account?)'
  })
  await check('c) voice button (.codexVoiceCall) sits on the send button within 0.5px (voice call = on)', async () => {
    await page.until(`!!document.querySelector('.codexVoiceCall')`, 15_000, '.codexVoiceCall')
    const geometry = await page.eval(`(() => {
      const voice = document.querySelector('.codexVoiceCall')
      const own = new Set(voice.className.split(/\\s+/).filter(name => !name.startsWith('codex')))
      const bar = voice.closest('[data-slot="conversation.composer.bar"]') || document
      const send = [...bar.querySelectorAll('button')].find(button => button !== voice && !button.className.toString().includes('codex') && [...own].some(name => button.classList.contains(name)))
      if (!send) return null
      // getBoundingClientRect already includes the element's own CSS transform
      const a = voice.getBoundingClientRect(); const b = send.getBoundingClientRect()
      return { dx: Math.abs(a.x - b.x), dy: Math.abs(a.y - b.y), dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height), transform: getComputedStyle(send).transform }
    })()`)
    if (geometry === null) return 'the send button was not found next to the voice button'
    const worst = Math.max(geometry.dx, geometry.dy, geometry.dw, geometry.dh)
    if (worst > 0.5) return `voice button is off the send button by ${worst.toFixed(2)}px (dx ${geometry.dx.toFixed(2)}, dy ${geometry.dy.toFixed(2)}, dw ${geometry.dw.toFixed(2)}, dh ${geometry.dh.toFixed(2)}; send transform ${geometry.transform})`
  })

  // ---- e) errors ----------------------------------------------------------------------------------
  const ours = problem => /codex|subscription/iu.test(`${problem.text} ${problem.url}`)
  await check('e) no uncaught exceptions or console errors from the plugin (settings, picker, session)', async () => {
    const all = page.problems
    for (const problem of all.filter(item => !ours(item) && item.kind === 'console.error')) console.log(`      note: console.error not from the plugin: ${problem.text.slice(0, 160)}`)
    const failures = all.filter(item => item.kind === 'exception' || ours(item))
    if (failures.length > 0) return failures.slice(0, 5).map(item => `${item.kind}: ${item.text.slice(0, 200)}`).join(' | ')
  })
} catch (error) {
  record('the smoke run itself', false, String(error.stack ?? error).split('\n').slice(0, 4).join(' / '))
} finally {
  const failed = results.filter(item => !item.ok)
  console.log(`\n${failed.length === 0 ? 'UI SMOKE PASSED' : `UI SMOKE FAILED: ${failed.length} of ${results.length} checks`} on DSH ${dshVersion ?? 'attached'}`)
  await exit(failed.length === 0 ? 0 : 1)
}
