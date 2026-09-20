import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
// Render documentation covers from captured product UI; no interface is reconstructed.
const require = createRequire(process.env.DSH_DESIGN_DEPS + '/package.json');
const { chromium } = require('playwright');
const sharp = require('sharp');
const browser = await chromium.launch({headless:true, channel:'chrome'});
try {
  for (const en of [false,true]) {
    const suffix = en ? '-en' : '';
    const source = await readFile(`docs/assets/subscription-account${suffix}.png`);
    const page = await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});
    await page.setContent(`<html lang="${en?'en':'zh-CN'}"><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:#111514;color:#f4f6f3;font-family:Arial,'Microsoft YaHei',sans-serif}
      main{width:1600px;height:1000px;padding:56px;display:grid;grid-template-columns:530px 1fr;gap:46px}
      .eyebrow{font-size:19px;color:#bdd2c5;letter-spacing:2px;font-weight:700}
      h1{font-size:64px;line-height:1.2;letter-spacing:-2px;margin:64px 0 28px}
      .intro{font-size:26px;line-height:1.6;color:#c6cec9;margin:0}
      .features{margin-top:48px;display:grid;gap:22px}.features div{font-size:25px;font-weight:600}.features small{font-size:18px;display:block;font-weight:400;color:#aab7af;margin-top:8px}
      .note{margin-top:48px;font-size:17px;line-height:1.6;color:#aab7af}
      .shot{display:flex;flex-direction:column;justify-content:center;gap:18px;min-height:0}.shot img{width:100%;max-height:840px;object-fit:contain;border-radius:22px;border:1px solid #414943}.caption{font-size:18px;color:#aab7af;text-align:center}
    </style><main><section><div class="eyebrow">DSH CODEX SUBSCRIPTION</div><h1>${en?'ChatGPT subscription.<br>Now in DSH.':'在 DSH 中使用<br>ChatGPT 订阅。'}</h1><p class="intro">${en?'Sign in to use your Codex access<br>inside DeepSeek Harness.':'直接登录，接入 Codex 订阅模型。<br>无需另外配置 OpenAI API Key。'}</p><div class="features"><div>${en?'Subscription models':'订阅模型直连'}<small>${en?'Use your existing ChatGPT sign-in':'使用已有 ChatGPT 登录'}</small></div><div>${en?'Quota, at a glance':'剩余额度，看得见'}<small>${en?'Account quota and compact composer display':'账号额度与输入框紧凑显示'}</small></div><div>${en?'Stay in your workflow':'模型与偏好，就地选择'}<small>${en?'Model choice, reasoning and Fast mode':'模型、推理档位与高速模式'}</small></div></div><p class="note">${en?'No API key for subscription chat.<br>Model access depends on your account.':'订阅聊天无需 API Key。<br>模型可用性以账号实际权限为准。'}</p></section><section class="shot"><img src="data:image/png;base64,${source.toString('base64')}"><div class="caption">${en?'Actual account & preferences screen · Private values hidden':'账号与偏好实机界面 · 账号标识与余额已遮盖'}</div></section></main></html>`);
    await page.evaluate(()=>document.fonts.ready);
    await sharp(await page.screenshot()).webp({quality:94}).toFile(path.resolve(`docs/assets/codex-subscription-overview${suffix}.webp`));
    await page.close();
  }
} finally {await browser.close()}
