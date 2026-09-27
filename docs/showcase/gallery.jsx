import React from 'react'
import { createRoot } from 'react-dom/client'
import { AccountDemo } from './account-demo.jsx'
const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh'
const copy = (zh, en) => lang === 'en' ? en : zh
function Gallery() {
  return <main className={`canvas ${lang}`}>
    <header><span className="brand">DSH <span>Codex Subscription</span></span><span className="open-source">OPEN SOURCE</span></header>
    <section className="story">
      <p className="eyebrow">CHATGPT × DEEPSEEK HARNESS</p>
      <h1>{copy(<>已有的订阅，<br/><em>在 DSH 接着用。</em></>, <>Your subscription.<br/><em>Now in DSH.</em></>)}</h1>
      <p className="intro">{copy(<>登录 ChatGPT，即可使用 Codex 订阅模型。<br/>无需 API Key。</>, <>Sign in to use your Codex models.<br/>No API key needed.</>)}</p>
      <ul className="features">
        <li><span className="feature-marker"/><div><strong>{copy('模型与推理，随你选择', 'Your models. Your reasoning level.')}</strong><span>Astra · Sol · Luna</span></div></li>
        <li><span className="feature-marker"/><div><strong>{copy('账号与额度，一眼看清', 'Accounts and quota, together.')}</strong><span>{copy('切换账号 · 额度显示 · 按需提醒', 'Switch accounts · Track quota · Get reminders')}</span></div></li>
      </ul>
      <div className="install"><span>{copy('在 DSH 插件页添加', 'ADD IN DSH PLUGINS')}</span><code>dsh-codex-subscription</code></div>
    </section>
    <figure className="product">
      <AccountDemo lang={lang} />
      <figcaption><span className="live-dot"/>{copy('界面演示 · 虚构账号与额度数据', 'Interface demo · Fictional account and quota data')}</figcaption>
    </figure>
    <footer><span>{copy('模型与额度以账号权限为准', 'Model access and quota depend on your account')}</span></footer>
  </main>
}
createRoot(document.getElementById('root')).render(<Gallery />)
