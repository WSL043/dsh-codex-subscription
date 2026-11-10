import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const languages = [
  ['README.md', '中文', 'zh'],
  ['README.en.md', 'English', 'en'],
  ['README.ja.md', '日本語', 'ja'],
  ['README.es.md', 'Español', 'es'],
  ['README.fr.md', 'Français', 'fr'],
  ['README.de.md', 'Deutsch', 'de'],
  ['README.ru.md', 'Русский', 'ru'],
  ['README.pt.md', 'Português', 'pt'],
]
const chineseMirror = 'README.zh-CN.md'
const files = [...languages.map(([file]) => file), chineseMirror]
const read = name => readFileSync(resolve(root, name), 'utf8').replaceAll('\r\n', '\n')
const fences = text => [...text.matchAll(/^```[^\n]*\n[\s\S]*?^```/gmu)].map(match => match[0])
const media = text => [...text.matchAll(/(?:src|srcset)="([^"]+)"/gu)].map(match => match[1]).sort()
const interfaceAsset = /^docs\/assets\/interface-(?:account|models)-[a-z]+\.png$/u

test('all README languages retain navigation, installation commands, media and stable section links', () => {
  const english = read('README.en.md')
  const chinese = read('README.md')
  assert.equal(chinese, read(chineseMirror), 'the existing Chinese URL remains a complete mirror')
  assert.match(chinese, /把 ChatGPT \/ Codex 订阅直接接入 DeepSeek Harness/u)
  assert.match(english, /Use your ChatGPT \/ Codex subscription directly/u)
  for (const file of files) {
    const body = read(file)
    assert.doesNotMatch(body, /\{(?:KEEP_|ALT_)/u, file)
    const current = file === chineseMirror ? 'README.md' : file
    const navigation = languages.map(([path, name]) => path === current ? `**${name}**` : `[${name}](${path})`).join(' · ')
    const menus = body.split('\n').filter(line => line.includes(' · ') && /\]\(README(?:\.[\w-]+)?\.md\)/u.test(line))
    assert.ok(menus.includes(navigation), `${file}: language order follows DSH`)
    for (const menu of menus) assert.ok(menu === navigation || menu === `${navigation} · [MIT](LICENSE)`, file)
    for (const match of body.matchAll(/\]\((#[^)]+|(?:docs\/[^)]+|LICENSE|CONTRIBUTING\.md|SECURITY\.md))\)/gu)) {
      const [path, fragment] = match[1].split('#')
      if (path) assert.ok(existsSync(resolve(root, path)), `${file}: ${path}`)
      else assert.ok(body.includes(`id="${fragment}"`) || body.split('\n').some(line => line.startsWith('#') && line.replace(/^#+\s*/u, '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/gu, '-') === fragment), `${file}: ${fragment}`)
    }
    const locale = languages.find(([path]) => path === current)[2]
    const assets = media(body)
    const localizedDemo = ['account', 'models'].map(view => `docs/assets/interface-${view}-${locale}.png`)
    assert.deepEqual(assets.filter(path => interfaceAsset.test(path)), localizedDemo, `${file}: localized interface demo`)
    for (const path of localizedDemo) assert.ok(existsSync(resolve(root, path)), `${file}: ${path}`)
    if (!['README.md', 'README.en.md', 'README.zh-CN.md'].includes(file)) {
      assert.deepEqual(fences(body), fences(english), `${file}: commands and data`)
      assert.deepEqual(assets.filter(path => !interfaceAsset.test(path)), media(english).filter(path => !interfaceAsset.test(path)), `${file}: shared demo assets`)
      assert.equal(body.split('\n').filter(line => /^#{1,6} /u.test(line)).length, english.split('\n').filter(line => /^#{1,6} /u.test(line)).length, `${file}: complete sections`)
      assert.equal(body.split('\n').filter(line => line.startsWith('|')).length, english.split('\n').filter(line => line.startsWith('|')).length, `${file}: complete feature tables`)
    }
  }
  for (const id of ['en', 'zh', 'ja', 'es', 'fr', 'de', 'ru', 'pt']) {
    const path = id === 'en' ? 'docs/plugin/DETAIL.md' : `docs/plugin/DETAIL.${id}.md`
    const target = id === 'zh' ? chineseMirror : `README.${id}.md`
    assert.ok(read(path).includes(`/blob/main/${target}`), path)
  }
})

test('compatibility rechecks update every existing language and still work on older two-README tags', () => {
  for (const readmes of [files.slice(0, 2), files]) {
    const tmp = mkdtempSync(join(tmpdir(), 'dsh-readme-'))
    try {
      for (const name of [...readmes, 'package.json', 'compatibility.json', 'dsh-codex.ps1']) cpSync(resolve(root, name), join(tmp, name))
      const compatibility = JSON.parse(read('compatibility.json'))
      const result = spawnSync(process.execPath, [resolve(root, 'scripts/prepare-compat-release.mjs'), '--root', tmp, '--dsh-version', compatibility.latestTested, '--recheck'], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      const version = JSON.parse(readFileSync(join(tmp, 'package.json'), 'utf8')).version
      for (const name of readmes) {
        const body = readFileSync(join(tmp, name), 'utf8')
        assert.ok(body.includes(`dsh-codex-subscription@${version}`), name)
        assert.ok(!body.includes(`dsh-codex-subscription@${JSON.parse(read('package.json')).version}`), name)
      }
    } finally { rmSync(tmp, { recursive: true, force: true }) }
  }
})
