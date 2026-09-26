import React from 'react'
import { createRoot } from 'react-dom/client'

const params = new URLSearchParams(location.search)
const lang = params.get('lang') === 'en' ? 'en' : 'zh'
const creative = params.get('view') === 'creative'
const copy = (zh, en) => lang === 'en' ? en : zh

function Gallery() {
  return <main className={creative ? 'canvas creative' : 'canvas'}>
    <header><span className="brand">DSH <span>Codex Subscription</span></span><span className="tag">OPEN SOURCE</span></header>
    {creative ? <>
      <section className="creative-copy">
        <p className="kicker">{copy('图片与草图', 'IMAGES & SKETCH')}</p>
        <h1>{copy(<>把想法<br/>继续画下去。</>, <>Keep your<br/>ideas moving.</>)}</h1>
        <p className="intro">{copy('生成、编辑，或从一张草图开始。', 'Generate, edit, or start with a sketch.')}</p>
        <div className="notes">
          <p><b>{copy('图片生成与编辑', 'Generate and edit')}</b><span>{copy('带上参考图，继续完善作品。', 'Refine your work with reference images.')}</span></p>
          <p><b>{copy('手动画板与 Agent 绘图', 'Draw by hand or with an agent')}</b><span>{copy('按需开启，分层编辑，保存草稿。', 'Optional tools, layers, and saved drafts.')}</span></p>
          <p><b>{copy('PNG 与分层 PSD', 'PNG and layered PSD')}</b><span>{copy('把作品带回自己的创作流程。', 'Take your artwork into your own workflow.')}</span></p>
        </div>
      </section>
      <figure className="creative-shot"><img src={`/real-creative-${lang}.png`} alt={copy('实际图片与草图设置', 'Actual image and sketch settings')}/></figure>
    </> : <>
      <section className="headline">
        <p className="kicker">{copy('已有 ChatGPT 订阅？', 'ALREADY HAVE A CHATGPT SUBSCRIPTION?')}</p>
        <h1>{copy(<>把 Codex，<em>接入 DSH。</em></>, <>Bring Codex <em>into DSH.</em></>)}</h1>
        <p className="intro">{copy('直接登录，无需 API Key。模型、搜索与额度，在熟悉的工作流里。', 'Sign in. No API key. Models, search, and quota in your existing workflow.')}</p>
      </section>
      <section className="product-grid">
        <div className="main-product">
          <div className="section-label"><span>01</span>{copy('模型与运行', 'MODELS & RUNTIME')}</div>
          <figure className="settings-shot"><img src={`/real-settings-${lang}.png`} alt={copy('实际模型与运行设置', 'Actual models and runtime settings')}/></figure>
        </div>
        <div className="supporting">
          <div className="section-label"><span>02</span>{copy('额度，随时看清', 'QUOTA, AT A GLANCE')}</div>
          <figure className="quota-shot"><img src={`/real-quota-${lang}.png`} alt={copy('实际订阅额度', 'Actual subscription quota')}/></figure>
          <h2>Astra <span>·</span> Sol <span>·</span> Luna</h2>
          <p>{copy('可用模型与推理档位随账号同步。', 'Models and reasoning levels follow your account.')}</p>
          <div className="benefits"><span>{copy('订阅登录', 'Subscription sign-in')}</span><span>{copy('多账号切换', 'Account switching')}</span><span>{copy('订阅搜索', 'Subscription search')}</span></div>
        </div>
      </section>
    </>}
    <footer><code>dsh-codex-subscription</code><span>{copy('DSH 实际界面 · 局部截图排版', 'Actual DSH interface · Cropped screenshots')}</span><span>{copy('模型与额度以账号权限为准', 'Model access and quota depend on your account')}</span></footer>
  </main>
}
createRoot(document.getElementById('root')).render(<Gallery />)
