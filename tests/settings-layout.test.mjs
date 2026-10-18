import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { en, zh } from '../src/client-locales.js'
import { CONNECTOR_MODES } from '../src/settings-contract.js'
import { STYLE } from '../src/client-styles.js'

test('every connectors mode has a label and a one-line description in both languages', () => {
  for (const dictionary of [zh, en]) {
    for (const mode of CONNECTOR_MODES) {
      assert.ok(dictionary[`connectors_${mode}`], `connectors_${mode}`)
      assert.ok(dictionary[`connectorsMode_${mode}`], `connectorsMode_${mode}`)
      assert.ok(dictionary[`connectors_${mode}`].length <= 24, 'a mode label stays short so the segmented control keeps one line')
    }
    assert.ok(dictionary.hintMore && dictionary.hintLess)
  }
})

test('long setting explanations fold to two lines and unfold on demand', async () => {
  const source = await readFile(new URL('../src/client-hint.jsx', import.meta.url), 'utf8')
  assert.match(source, /scrollHeight > node\.clientHeight/u, 'the More link only appears when the text is actually cut off')
  assert.match(STYLE, /\.codexSubscriptionHintText\{[^}]*-webkit-line-clamp:2/u)
  assert.match(STYLE, /\.codexSubscriptionHintFold\[data-open=true\] \.codexSubscriptionHintText\{[^}]*-webkit-line-clamp:unset/u)
  assert.doesNotMatch(STYLE, /\.codexSubscriptionPreferenceHint\{[^}]*max-width:300px/u, 'a hint uses the width of its row')
})

test('the connectors row keeps its choices on one line beside the label and shows the chosen mode', async () => {
  const source = await readFile(new URL('../src/client-preferences.jsx', import.meta.url), 'utf8')
  assert.match(source, /codexSubscriptionConnectors/u)
  assert.match(source, /connectorsMode_\$\{snapshot\.connectors\}/u)
  assert.match(source, /data-danger=\{snapshot\.connectors === 'write'/u, 'writing without asking is shown as a warning')
  assert.match(STYLE, /\.codexSubscriptionPreferenceStack>\.codexSubscriptionQuotaModes\{[^}]*grid-auto-columns:minmax\(0,1fr\)/u)
})

test('every fold-out row in the settings is a pressable row with a chevron that turns when it opens', () => {
  for (const name of ['codexSubscriptionHistory>summary', 'codexSubscriptionSearchOptions>summary', 'codexSubscriptionRuntime summary', 'codexImageDetails summary']) {
    assert.ok(STYLE.includes(`.${name}::after`), `${name} has a chevron`)
    assert.ok(STYLE.includes(`.${name}:hover`), `${name} has a hover state`)
  }
  assert.match(STYLE, /\[open\]>summary::after\{transform:translateY\(2px\) rotate\(-135deg\)\}/u)
  assert.match(STYLE, /\.codexSubscriptionHintToggle\{[^}]*color:var\(--dsw-alias-label-primary\)/u)
})
