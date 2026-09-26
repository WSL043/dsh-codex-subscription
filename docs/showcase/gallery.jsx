import React from 'react'
import {createRoot} from 'react-dom/client'
import {AccountCard} from '../../src/client-account.jsx'
import {UsageCard} from '../../src/client-usage.jsx'
import {QuickQuotaPreference} from '../../src/client-preferences.jsx'
import {ImagePreferences} from '../../src/image-preferences.jsx'
import {STYLE} from '../../src/client-styles.js'
import {zh,en} from '../../src/client-locales.js'

const english=new URLSearchParams(location.search).get('lang')==='en'
const detail=new URLSearchParams(location.search).get('view')==='creative'
const copy=(a,b)=>english?b:a
const t=key=>(english?en:zh)[key]??key
const account={authenticated:true,accounts:[{id:'demo',email:'demo@example.com',active:true}]}
const state={status:'ready',writable:true,quickQuotaMode:'percent',imageGeneration:true,imageEditing:true,imageShortcut:true,imageViewer:true,imageAnnotations:true,imageModel:'gpt-image-2',imageQuality:'auto',imageSketch:false,imageSketchAgent:false,imageSketchAgentPreview:false}
const preference={subscribe:()=>()=>{},getSnapshot:()=>state,set:async()=>{}}
const rpc={call:async(_channel,endpoint)=>{if(endpoint!=='usage')throw Error('Documentation fixture: action disabled');return {ok:true,value:{rateLimits:[{id:'codex',name:'Codex',windows:[{windowSeconds:18000,remainingPercent:75,usedPercent:25,resetsAt:1790521200},{windowSeconds:604800,remainingPercent:82,usedPercent:18,resetsAt:1790812800}]}]}}}}
const tabs=[t('settingsTab_account'),t('settingsTab_advanced'),t('settingsTab_creative'),t('settingsTab_maintenance')]
function Gallery(){return <main className={`spread ${detail?'creative':''}`}>
  <header className="masthead"><span className="brand-mark" aria-hidden="true">&gt;_</span><span>DSH CODEX SUBSCRIPTION</span><span className="edition">2.2</span></header>
  <section className="editorial">
    <div className="eyebrow">{detail?copy('02 / 按需创作','02 / CREATE WHEN YOU NEED IT'):copy('01 / 订阅，从这里接入','01 / YOUR SUBSCRIPTION, CONNECTED')}</div>
    <h1>{detail?copy(<>从一个想法，<br/>到一张作品。</>,<>From an idea.<br/>To an image.</>):copy(<>你的 ChatGPT。<br/>现在，在 DSH。</>,<>Your ChatGPT.<br/>Now in DSH.</>)}</h1>
    <p className="lead">{detail?copy('生图、编辑、草图，各有入口。\n需要什么，就开启什么。','Generate, edit, or sketch.\nTurn on only what you need.'):copy('使用已有订阅登录。\n模型、搜索与额度，都在工作流里。','Sign in with your existing subscription.\nModels, search, and quota in one workflow.')}</p>
    <div className="features">{(detail?[
      [copy('图片生成与编辑','Generate & edit'),copy('带着参考图，把想法继续完善','Refine an idea with reference images')],
      [copy('手动画板与 Agent 绘图','Sketch, by hand or with an agent'),copy('分层、曲线、PSD 与可编辑草稿','Layers, curves, PSD, and editable drafts')],
      [copy('按需开启','Optional by default'),copy('画板与 Agent 工具分别控制','Separate canvas and agent controls')]
    ]:[
      [copy('无需 API Key','No API key'),copy('直接使用 ChatGPT / Codex 登录','Use your ChatGPT / Codex sign-in')],
      [copy('额度，一眼看清','Quota, at a glance'),copy('账号额度与输入框显示联动','Account limits and inline quota display')],
      [copy('保持原有工作流','Stay in your workflow'),copy('模型、推理档位与高速模式就地选择','Model, reasoning, and Fast mode in DSH')]
    ]).map(([title,body],i)=><div className="feature" key={title}><span>0{i+1}</span><div><strong>{title}</strong><p>{body}</p></div></div>)}</div>
    <div className="install-label">{copy('插件页面 → 添加插件','PLUGINS → ADD PLUGIN')}<code>dsh-codex-subscription</code></div>
  </section>
  <section className="product">
    <div className="window-head"><div className="window-dots"><i/><i/><i/></div><span>{copy('订阅设置','Subscription settings')}</span><span>DSH</span></div>
    <div className="product-body codexSubscription"><h2>{t('title')}</h2><div className="codexSettingsTabs">{tabs.map((tab,i)=><button key={tab} aria-selected={i===(detail?2:0)}>{tab}</button>)}</div>
    {detail?<><ImagePreferences preference={preference} t={t}/><ImagePreferences preference={preference} t={t} section="sketch"/></>:<><AccountCard rpc={rpc} t={t} account={account} setAccount={()=>{}} onSignedOut={()=>{}}/><UsageCard rpc={rpc} t={t} signedIn resetKey={0} preference={preference}/><div className="codexSubscriptionCard"><QuickQuotaPreference preference={preference} t={t}/></div></>}
    </div><div className="window-foot"><span className="live-dot"/>{copy('真实产品组件 · 演示数据','Actual product components · Demo data')}</div>
  </section>
  <footer><span>OPEN SOURCE · MIT</span><span>{copy('模型与额度以账号实际权限为准','Model access and quota depend on your account')}</span><span>WSL043 / DSH-CODEX-SUBSCRIPTION</span></footer>
</main>}
document.head.appendChild(Object.assign(document.createElement('style'),{textContent:STYLE}))
createRoot(document.getElementById('root')).render(<Gallery/> )
