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

test('model names go through the host label slot so official badges show in our picker', async () => {
  const select = await readFile(new URL('../src/client-model-select.jsx', import.meta.url), 'utf8')
  const client = await readFile(new URL('../src/client.jsx', import.meta.url), 'utf8')
  assert.ok(!client.includes("children: { 'conversation.input.model.label'"), 'DSH's own picker declares the slot; declaring it again makes DSH refuse the picker')
  for (const placement of ['trigger', 'menu', 'option']) assert.ok(select.split(String.fromCharCode(10)).some(line => line.includes('labelOf(') && line.includes("'" + placement + "'")), placement + ' label')
  assert.ok(select.includes("renderSlot('conversation.input.model.label', { provider: { id: group.id, name: group.name }, model, placement, selected }, { fallback: model.name })"))
  assert.ok(select.includes("typeof renderSlot !== 'function') return model.name"), 'hosts without the slot keep the plain name')
})
