import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { dictionaries } from '../src/client-languages.js'
import { formatDuration } from '../src/usage-heatmap.js'
import { formatQuotaRunout } from '../src/quota-forecast-view.js'

const require = createRequire(import.meta.url)
const names = ['zh', 'en', 'ja', 'es', 'fr', 'de', 'ru', 'pt']
const placeholders = text => [...text.matchAll(/\{[A-Za-z][\w-]*\}/gu)].map(match => match[0]).sort()
const dateArguments = {
  quotaWhenToday: ['{day}', '{part}'], quotaWhenTonight: ['{day}', '{part}'],
  quotaWhenEarlyToday: ['{day}', '{part}'], quotaWhenEarly: ['{day}', '{part}'],
  quotaWhenRangeEnd: ['{part}', '{label}'], quotaWhenEarlyMorningRange: ['{from}', '{to}', '{latest}'],
}
const text = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('every supported UI translation preserves the full dictionary and interpolation contract', () => {
  assert.deepEqual(Object.keys(dictionaries), names)
  for (const [language, dictionary] of Object.entries(dictionaries)) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(dictionaries.en).sort(), language)
    for (const [key, value] of Object.entries(dictionary)) {
      assert.equal(typeof value, 'string', `${language}.${key}`)
      assert.ok(value.trim(), `${language}.${key}`)
      // Date grammar can use different subsets of the supplied day/period labels.
      // Other templates must keep every interpolation, including repetitions.
      if (dateArguments[key]) assert.ok(placeholders(value).every(name => dateArguments[key].includes(name)), `${language}.${key}`)
      else assert.deepEqual(placeholders(value), placeholders(dictionaries.en[key]), `${language}.${key}`)
    }
    const { meta } = JSON.parse(text(`locale/${language}.json`))
    assert.ok(meta.title && meta.description)
    assert.ok(existsSync(new URL(`../${meta.detail}`, import.meta.url)))
  }
})

test('DSH native locale registration switches existing translators, falls back, and releases dictionaries', () => {
  let definition
  runInNewContext(readFileSync(require.resolve('@deepseek-ai/dsh-client-locale/client'), 'utf8'), {
    window: { __ModuleLoader__: { load: value => { definition = value } } },
    navigator: { languages: ['en-US'] },
  })
  const { LocaleRuntime } = definition.factory(id => id.startsWith('react') ? require(id) : {})
  const locale = new LocaleRuntime({ emit() {} })
  for (const language of names.filter(name => !['zh', 'en'].includes(name))) locale.addLanguage({ id: language, label: language, fallback: 'en' })
  const dispose = locale.register('subscription-test', dictionaries)
  const t = locale.bind('subscription-test')
  let updates = 0
  const unwatch = locale.subscribe(() => { updates++ })
  for (const language of names) {
    locale.setLocale(language)
    assert.equal(t('title'), dictionaries[language].title)
    assert.equal(locale.resolveText(Object.fromEntries(names.map(id => [id, JSON.parse(text(`locale/${id}.json`)).meta.title]))), JSON.parse(text(`locale/${language}.json`)).meta.title)
  }
  locale.addLanguage({ id: 'it', label: 'Italiano', fallback: 'en' })
  locale.setLocale('it')
  assert.equal(t('title'), dictionaries.en.title)
  assert.ok(updates >= names.length)
  unwatch(); dispose()
  assert.equal(t('title'), 'title')
})

test('localized durations and quota dates retain numbers, time zones and DST boundaries', () => {
  assert.match(formatDuration(5400, key => dictionaries.de[key], 'de-DE'), /1,5/u)
  for (const language of names) {
    const t = key => dictionaries[language][key]
    const result = formatQuotaRunout({ kind: 'time', earliest: Date.UTC(2026, 10, 1, 14), latest: Date.UTC(2026, 10, 2, 14) }, {
      t, locale: language, timeZone: 'America/New_York', now: Date.UTC(2026, 10, 1, 12),
    })
    assert.ok(result && !/undefined|NaN|\{[a-z]+\}/u.test(result), language)
    const dateLabel = day => formatQuotaRunout({ kind: 'time', earliest: Date.UTC(2026, 10, day, 14), latest: Date.UTC(2026, 10, day, 14) }, {
      t, locale: language, timeZone: 'America/New_York', now: Date.UTC(2026, 10, 1, 12),
    })
    assert.notEqual(dateLabel(15), dateLabel(16), `${language} keeps the calendar date`)
  }
})
