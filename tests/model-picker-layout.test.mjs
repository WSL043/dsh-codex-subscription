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
test('the model list uses the space remaining below search in the bounded menu', () => {
  const menu = rule('codexModelSelectMenu')
  assert.match(menu, /(?:^|;)display:flex(?:;|$)/u)
  assert.match(menu, /(?:^|;)flex-direction:column(?:;|$)/u)
  assert.match(menu, /(?:^|;)position:fixed(?:;|$)/u, 'the menu is placed like the DSH picker, above the trigger')
  assert.match(rule('codexModelSelectSearchRow'), /(?:^|;)flex-shrink:0(?:;|$)/u)

  const groups = rule('codexModelSelectGroups')
  assert.match(groups, /(?:^|;)flex:1 1 auto(?:;|$)/u)
  assert.match(groups, /(?:^|;)min-height:0(?:;|$)/u)
  assert.match(groups, /(?:^|;)overflow-y:auto(?:;|$)/u)
  assert.doesNotMatch(groups, /(?:^|;)(?:max-)?height:/u,
    'a second height budget ignores search, loading, warnings, padding, and borders')
})

test('rows drill into the same menu surface, as in the DSH picker', async () => {
  const source = await readFile(new URL('../src/client-model-select.jsx', import.meta.url), 'utf8')
  const modelPane = source.slice(source.indexOf("} else if (pane === 'model')"), source.indexOf("} else if (pane === 'effort')"))
  assert.match(modelPane, /className="codexModelSelectSearchRow"/u)
  assert.match(modelPane, /className="codexModelSelectSearch"/u)
  assert.match(modelPane, /className="codexModelSelectGroups scrollable"/u)
  assert.doesNotMatch(source, /codexModelSelectSubmenu/u, 'no flyout beside the root menu')
  assert.match(source, /createPortal\(/u, 'the menu is portalled out of the composer like the DSH picker')
  assert.match(source, /MenuSurface \?\? 'div'/u, 'older hosts without MenuSurface keep working')
})
