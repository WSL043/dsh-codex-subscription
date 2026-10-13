import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { STYLE } from '../src/client-styles.js'

const rule = className => {
  const selector = `.${className}{`
  const start = STYLE.indexOf(selector)
  assert.notEqual(start, -1, `${className} has a layout rule`)
  return STYLE.slice(start + selector.length, STYLE.indexOf('}', start))
}

// Source contracts complement installed-browser geometry and hit-testing:
// Node does not implement CSS layout, so these are not browser assertions.
test('the model list uses the space remaining below search in the bounded submenu', () => {
  const menu = rule('codexModelSelectModelMenu')
  assert.match(menu, /(?:^|;)display:flex(?:;|$)/u)
  assert.match(menu, /(?:^|;)flex-direction:column(?:;|$)/u)
  assert.match(rule('codexModelSelectSearch'), /(?:^|;)flex-shrink:0(?:;|$)/u)

  const groups = rule('codexModelSelectGroups')
  assert.match(groups, /(?:^|;)flex:1 1 auto(?:;|$)/u)
  assert.match(groups, /(?:^|;)min-height:0(?:;|$)/u)
  assert.match(groups, /(?:^|;)overflow-y:auto(?:;|$)/u)
  assert.doesNotMatch(groups, /(?:^|;)(?:max-)?height:/u,
    'a second height budget ignores search, loading, warnings, padding, and borders')
})

test('only the model pane opts into the shrinking list layout', async () => {
  const source = await readFile(new URL('../src/client-model-select.jsx', import.meta.url), 'utf8')
  const modelPane = source.slice(source.indexOf("if (pane === 'model')"), source.indexOf("} else if (pane === 'effort')"))
  assert.match(modelPane, /className="codexModelSelectSubmenu codexModelSelectModelMenu"/u)
  assert.match(modelPane, /className="codexModelSelectSearch"/u)
  assert.match(modelPane, /className="codexModelSelectGroups scrollable"/u)
  assert.equal(source.match(/codexModelSelectModelMenu/gu)?.length, 1,
    'effort, speed, and verbosity panes must keep their existing layout')
  assert.match(STYLE, /\.codexModelSelectMenu\{overflow:visible\}/u,
    'the root menu must not clip its nested submenu')
})
