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

test('a setting explanation only folds when that saves several lines', async () => {
  const source = await readFile(new URL('../src/client-hint.jsx', import.meta.url), 'utf8')
  const MIN_FOLD_LINES = Number(/MIN_FOLD_LINES = (\d+)/u.exec(source)[1]), FOLDED_LINES = Number(/FOLDED_LINES = (\d+)/u.exec(source)[1])
  assert.ok(MIN_FOLD_LINES - FOLDED_LINES >= 3, 'folding must hide at least three lines')
  assert.match(source, /scrollHeight/u, 'the length is measured, not guessed')
  assert.match(source, /const folds = lines >= MIN_FOLD_LINES/u)
  assert.match(STYLE, /\.codexSubscriptionHintFold\[data-fold=true\] \.codexSubscriptionHintText\{[^}]*-webkit-line-clamp:3/u)
  assert.doesNotMatch(STYLE, /(?:^|\n)\.codexSubscriptionHintText\{[^}]*-webkit-line-clamp/u, 'unfolded text is never clamped')
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

test('the sketch button in the composer is transparent like its neighbours, not the dark image-toolbar fill', async () => {
  const { readFile } = await import('node:fs/promises')
  const source = await readFile(new URL('../src/image-workspace.jsx', import.meta.url), 'utf8')
  assert.ok(source.includes('<Button variant="ghost"'), 'ghost variant: transparent, with a hover state')
  assert.ok(!source.includes('variant="toolbar"'), 'the toolbar variant is the dark fill meant for image viewers')
})
