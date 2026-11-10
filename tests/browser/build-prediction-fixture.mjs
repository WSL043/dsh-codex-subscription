import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'tsdown'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(root, '.artifacts/prediction-layout')
const theme = resolve(process.argv[2] ?? resolve(root, '../claude-style'))
await mkdir(output, { recursive: true })
const host = await readFile(resolve(root, 'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'), 'utf8')
const cssLiteral = host.split('\n').find(line => line.includes('const css$1 = ') && line.includes('_overlayAnchor'))
if (!cssLiteral) throw new Error('The installed DSH InputBar CSS contract changed')
const hostCss = JSON.parse(cssLiteral.slice(cssLiteral.indexOf('=') + 1).trim().replace(/;$/, ''))
const themeCss = (await Promise.all(['card.css', 'inline.css'].map(name => readFile(resolve(theme, 'packages/client/src/features/composer', name), 'utf8')))).join('\n')
await writeFile(resolve(output, 'host-input.css'), hostCss.replaceAll('}', '}\n'))
await build({
  config: false, cwd: root,
  entry: { fixture: resolve(root, 'tests/browser/composer-prediction.fixture.jsx') },
  outDir: output, format: 'iife', platform: 'browser', target: 'es2022',
  dts: false, clean: false, fixedExtension: false,
  deps: { alwaysBundle: [/./] },
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
})
await writeFile(resolve(output, 'index.html'), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Prediction layout acceptance — offline</title><style>
:root{--dsh-composer-card-max-width:760px;--dsh-composer-side-clearance:16px;--dsh-composer-text-max-height:180px;--dsh-content-font-size:14px;--dsh-content-font-delta:0px;--dsw-font-family:Arial,"Microsoft YaHei",sans-serif;--dsw-radius-panel:20px;--dsw-specific-input-major:#fff;--dsw-alias-label-primary:#25241f;--dsw-alias-label-caption:#888;--dsw-alias-bg-base:#f8f7f4;--dsw-alias-bg-l2:#eee;--dsw-alias-border-l1:#ccc;--dsw-elevation-soft:0 1px 4px #0002;--dsh-claude-interface-font-scale:1;--dsh-claude-timing-feedback:0ms}
body{margin:32px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:14px/24px var(--dsw-font-family)}body[data-ds-dark-theme]{--dsw-specific-input-major:#292824;--dsw-alias-label-primary:#eee;--dsw-alias-bg-base:#1f1e1c;--dsw-alias-bg-l2:#444;--dsw-alias-border-l1:#555}h1{font-size:20px}button{font:inherit}#root{max-width:760px;margin:32px auto}[data-composer-input]:focus{outline:none}
</style><style>${hostCss}</style><style data-fixture-theme>${themeCss}</style></head><body data-dsh-claude-style data-dsh-claude-composer-active><h1>输入预测布局验收 · 离线测试</h1><p>真实预测组件 + 已发布宿主输入框 CSS + Claude 主题 CSS。固定测试建议，不连接模型或账户。</p><div id="root"></div><script src="./fixture.iife.js"></script></body></html>`)
console.log(resolve(output, 'index.html'))
