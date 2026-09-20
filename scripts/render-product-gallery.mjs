import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(process.env.DSH_DESIGN_DEPS+'/package.json');
const {chromium}=require('playwright');
const sharp=require('sharp');
const root=process.cwd();
const out=path.join(root,'docs/assets');
const img=async name=>'data:image/png;base64,'+(await readFile(path.join(out,name))).toString('base64');
const art=await img('sketch-advanced-result.png');
const sketch=await img('sketch-advanced-source.png');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
for(const en of [false,true]) {
 const suffix=en?'-en':'';
 const settings=await img('settings-advanced-current'+suffix+'.png');
 const css=`*{box-sizing:border-box}body{margin:0;background:#101614;color:#f3f6ee;font-family:Arial,'Microsoft YaHei',sans-serif}main{width:1600px;height:1000px;padding:64px;position:relative;overflow:hidden}.eyebrow{font-size:21px;letter-spacing:3px;color:#b8d7bb;font-weight:700}h1{font-size:74px;line-height:1.12;letter-spacing:-3px;margin:36px 0 26px}p{font-size:25px;line-height:1.6;color:#bfcac3;margin:0}.brand{position:absolute;bottom:34px;left:64px;font-size:18px;color:#9cafa2}.num{position:absolute;right:64px;bottom:34px;color:#9cafa2;font-size:18px}.tags{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}.tags span{padding:12px 18px;border:1px solid #46594c;border-radius:30px;font-size:21px}.hero{display:grid;grid-template-columns:540px 1fr;gap:60px;margin-top:24px}.picture{border-radius:24px;overflow:hidden;background:#eeeade}.picture img{width:100%;height:100%;object-fit:contain;display:block}.label{font-size:20px;color:#becac2;margin:15px 0}.pair{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:30px}.pair .picture{height:560px}.smalltitle{font-size:53px;margin:20px 0 12px;letter-spacing:-1px}.settings{width:1100px;border-radius:24px;display:block;margin:25px auto 0}.foot{font-size:19px;color:#bac6be;margin-top:18px}`;
 const title=en?'Codex, inside<br>DeepSeek<br>Harness.':'把 Codex 订阅<br>带进 DSH。';
 const cover=`<div class="eyebrow">DSH CODEX SUBSCRIPTION</div><div class="hero"><section><h1>${title}</h1><p>${en?'Sign in with ChatGPT.<br>Code, search, and create images.':'登录 ChatGPT，即可开始。<br>写代码、查资料，也能创作图片。'}</p><div class="tags"><span>${en?'No API key':'无需 API Key'}</span><span>${en?'Visible quota':'额度可见'}</span><span>${en?'Fast mode':'高速模式'}</span></div><div style="margin-top:65px;border-left:3px solid #b9d9a1;padding-left:22px"><p>${en?'From an agent-drawn sketch<br>to a finished illustration.':'从 Agent 绘制的草图，<br>到真正生成的插画。'}</p><div class="label">${en?'Actual plugin result · Image tools Beta':'插件实际生成结果 · 图片工具 Beta'}</div></div></section><section><div class="picture" style="height:685px"><img src="${art}"></div><div class="label">${en?'Draw an idea. Give it a world.':'画出想法，让它成为一个世界。'}</div></section></div>`;
 const flow=`<div class="eyebrow">SKETCH → IMAGE · BETA</div><h1 class="smalltitle">${en?'A sketch becomes a finished illustration.':'从画布上的构想，到完整插画。'}</h1><p>${en?'Astra draws the sketch. The subscription image tool takes it further.':'Astra 绘制草图，再交给订阅图片工具完成创作。'}</p><div class="pair"><section><div class="picture"><img src="${sketch}"></div><div class="label">01 / ${en?'Agent-drawn sketch · editable layers':'Agent 草图 · 可编辑图层'}</div></section><section><div class="picture"><img src="${art}"></div><div class="label">02 / ${en?'Actual generated image':'实际生成结果'}</div></section></div><div class="foot">${en?'Existing real example. Sketch and Agent drawing are optional Beta features.':'已有真实案例。草图与 Agent 绘画均为可选 Beta 功能。'}</div>`;
 const controls=`<div class="eyebrow">MODELS / SEARCH / CONTEXT</div><h1 class="smalltitle">${en?'Your workflow. Your settings.':'模型、搜索与上下文，按需选择。'}</h1><p>${en?'Current DSH interface · Advanced subscription settings':'当前 DSH 实机界面 · 订阅高级设置'}</p><img class="settings" src="${settings}"><div class="foot" style="text-align:center">${en?'Experimental connection and compaction options remain clearly marked.':'连接方式与云端压缩等试验选项保留明确标识。'}</div>`;
 for(const [name,body,n] of [['codex-subscription-overview',cover,'01'],['codex-sketch-to-image',flow,'02'],['codex-subscription-settings',controls,'03']]){
  const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
  await page.setContent(`<html lang="${en?'en':'zh-CN'}"><meta charset="utf-8"><style>${css}</style><main>${body}<div class="brand">dsh-codex-subscription · Open source</div><div class="num">${n} / 03</div></main></html>`);
  await page.evaluate(()=>document.fonts.ready);
  const data=await page.screenshot();
  await sharp(data).webp({quality:92}).toFile(path.join(out,name+suffix+'.webp'));
  await page.close();
 }
}
} finally {await browser.close()}
