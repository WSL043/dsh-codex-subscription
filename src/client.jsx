import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { BoltIcon } from '@heroicons/react/16/solid'
import { Button, IconCheckOutline16, IconChevronDownOutline14, IconChevronRightOutline14, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  normalizeSpeedMode,
  normalizeSearchProvider,
  QUICK_QUOTA_FIELD,
  SEARCH_PROVIDER_CODEX,
  SEARCH_PROVIDER_DSH,
  SEARCH_PROVIDER_FIELD,
  SETTINGS_NAMESPACE,
  SPEED_MODE_FAST,
  SPEED_MODE_FIELD,
  SPEED_MODE_STANDARD,
  supportsCodexFastMode,
} from './settings-contract.js'
import { selectModelQuota } from './sidebar-quota.js'
import { readLoginProgress } from './login-progress.js'

export const inject = [
  'slots', 'locale', 'connection', 'remote', 'settingsScope', 'modelDirectories', 'conversation', 'sessions',
]

const NS = 'settings.codexSubscription'
const CHANNEL = '/codex-subscription'
const QUICK_QUOTA_REFRESH_EVENT = 'dsh-codex-subscription:refresh-quick-quota'
const QUICK_QUOTA_REFRESH_MS = 60_000

const zh = {
  nav: 'Codex 订阅',
  title: 'Codex 订阅',
  connected: '已登录', disconnected: '未登录', accountLoading: '正在读取账户状态…',
  browserLogin: '浏览器登录', deviceLogin: '设备代码登录', logout: '退出登录',
  cancel: '取消', submit: '提交授权码', openLogin: '打开登录页',
  manualCode: '若浏览器回调没有自动完成，请粘贴授权码或完整重定向地址。',
  deviceHint: '在登录页输入此设备代码：', waiting: '正在等待登录完成…',
  failed: '登录失败，请重试。', loadFailed: '无法读取账户状态。', accountRetry: '重试',
  diagnostics: '支持诊断', diagnosticsHint: '生成不含凭据、账号标识和授权时间的诊断信息。', diagnosticsLoad: '生成诊断', diagnosticsCopy: '复制诊断', diagnosticsCopied: '已复制', diagnosticsFailed: '无法生成诊断信息。',
  searchTitle: '搜索来源',
  searchDsh: 'DSH 默认', searchDshHint: '当前搜索服务',
  searchCodex: 'Codex 订阅', searchCodexHint: 'ChatGPT 订阅搜索',
  preferenceFailed: '设置未保存。', preferenceRetry: '重试',
  usage: '订阅额度',
  refresh: '刷新', refreshing: '刷新中…', noUsage: '登录后可读取 ChatGPT 返回的额度窗口。',
  usageLoading: '正在读取额度…', usageEmpty: '当前账户没有返回可显示的额度窗口。请稍后刷新；这不代表额度为零。',
  usageUpdated: '更新于 {value}', remaining: '剩余 {value}%',
  windowFiveHours: '5 小时额度', windowDaily: '每日额度', windowWeekly: '每周额度', windowMonthly: '每月额度', windowAnnual: '年度额度',
  windowHours: '{value} 小时额度', windowDays: '{value} 天额度', resets: '重置于 {value}', resetUnknown: '重置时间未提供',
  creditsBalance: '额外 Credits 余额', creditsUnit: 'credits', unlimited: '不限额', monthlyCreditLimit: 'Credits 月度消费上限',
  resetCredits: '可用额度重置次数', resetCreditsValue: '{count} 次',
  resetUse: '使用一次重置', resetUnavailable: '仅当至少一个 Codex 模型额度已用尽时可使用。',
  resetPreparing: '正在读取重置详情…', resetConfirmTitle: '确认使用额度重置',
  resetWarning: '此操作会立即消耗 1 次额度重置，且无法撤销。请确认你确实需要恢复已用尽的模型额度。',
  resetAcknowledge: '我知道这会消耗 1 次额度重置', resetTypeHint: '输入 {phrase} 以继续',
  resetWait: '请再等待 {count} 秒', resetFinal: '消耗 1 次并重置额度', resetUsing: '正在重置…',
  resetSuccess: '额度重置已完成。', resetNothing: '当前没有可重置的额度，未消耗新的重置次数。',
  resetNoCredit: '没有可用的额度重置。', resetAlready: '这次重置请求已处理。', resetFailed: '无法使用额度重置。',
  resetRenewLogin: '登录状态已失效，请重新登录。', resetExpired: '本次确认已失效，请重新开始。',
  resetInProgress: '额度重置正在处理中。', resetTooEarly: '请等待冷静期结束后再确认。',
  resetPhraseMismatch: '确认短语不一致。', resetNotExhausted: '当前 Codex 模型额度尚未用尽。',
  resetAccountChanged: '登录账号已变更，请重新开始。',
  creditsNote: '仅显示 Codex 为此账户或工作区实际返回的额外 Credits、消费上限或额度重置次数；三者不是同一项。',
  creditsUsed: '已用 {used} / {limit} credits', spendReached: 'Credits 月度消费上限已用尽。', unavailable: '暂无数据',
  quickQuotaSetting: '输入框额度',
  quickQuotaBeta: 'Beta', quickQuotaStatus: 'Codex 剩余额度 {value}%',
  speedTitle: '速度', speedStandard: '标准', speedStandardHint: '标准速度',
  speedFast: '高速', speedFastHint: '1.5 倍，消耗更多 Credits',
  modelMenuAria: '模型、推理等级与速度', modelLabel: '模型', effortLabel: '推理等级', providerDefault: 'Default', selectModel: '选择模型',
  modelsLoading: '正在读取模型…', modelsEmpty: '没有可用模型。', effortsEmpty: '当前模型未提供推理等级。', modelRetry: '重试', modelFailed: '模型目录加载失败：{value}', groupFailed: '{name}：{value}',
  imageGenerate: '生成图片', imageGenerating: '正在生成…', imageGenerated: '已生成', imageFailed: '生成失败',
  imageLabel: '生成的图片', imageOpen: '查看原图', imageOpenNamed: '查看 {value}', imageLoading: '正在加载图片…', imageLoadFailed: '图片加载失败，点击重试', imagePreview: '图片预览', imageClosePreview: '关闭预览',
}

const en = {
  nav: 'Codex',
  title: 'Codex subscription',
  connected: 'Signed in', disconnected: 'Not signed in', accountLoading: 'Reading account status…',
  browserLogin: 'Browser sign-in', deviceLogin: 'Device-code sign-in', logout: 'Sign out',
  cancel: 'Cancel', submit: 'Submit authorization code', openLogin: 'Open sign-in page',
  manualCode: 'If the browser callback did not finish automatically, paste the code or full redirect URL.',
  deviceHint: 'Enter this device code on the sign-in page:', waiting: 'Waiting for sign-in to finish…',
  failed: 'Sign-in failed. Try again.', loadFailed: 'Could not read account status.', accountRetry: 'Retry',
  diagnostics: 'Support diagnostics', diagnosticsHint: 'Create a report without credentials, account identifiers, or authorization timestamps.', diagnosticsLoad: 'Create report', diagnosticsCopy: 'Copy report', diagnosticsCopied: 'Copied', diagnosticsFailed: 'Could not create diagnostics.',
  searchTitle: 'Search source',
  searchDsh: 'DSH default', searchDshHint: 'Current search service',
  searchCodex: 'Codex subscription', searchCodexHint: 'ChatGPT subscription search',
  preferenceFailed: 'The setting was not saved.', preferenceRetry: 'Retry',
  usage: 'Subscription quota',
  refresh: 'Refresh', refreshing: 'Refreshing…', noUsage: 'Sign in to read quota windows reported by ChatGPT.',
  usageLoading: 'Reading quota…', usageEmpty: 'This account returned no displayable quota windows. Refresh later; this does not mean zero quota.',
  usageUpdated: 'Updated {value}', remaining: '{value}% remaining',
  windowFiveHours: '5-hour quota', windowDaily: 'Daily quota', windowWeekly: 'Weekly quota', windowMonthly: 'Monthly quota', windowAnnual: 'Annual quota',
  windowHours: '{value}-hour quota', windowDays: '{value}-day quota', resets: 'Resets {value}', resetUnknown: 'Reset time not provided',
  creditsBalance: 'Extra Credits balance', creditsUnit: 'credits', unlimited: 'Unlimited', monthlyCreditLimit: 'Monthly Credits spending cap',
  resetCredits: 'Available quota resets', resetCreditsValue: '{count} available',
  resetUse: 'Use one reset', resetUnavailable: 'Available only when at least one Codex model quota is exhausted.',
  resetPreparing: 'Reading reset details…', resetConfirmTitle: 'Confirm quota reset',
  resetWarning: 'This immediately consumes one quota reset and cannot be undone. Continue only if you intend to restore an exhausted model quota.',
  resetAcknowledge: 'I understand this consumes one quota reset', resetTypeHint: 'Type {phrase} to continue',
  resetWait: 'Wait {count} more seconds', resetFinal: 'Consume one reset', resetUsing: 'Resetting…',
  resetSuccess: 'Quota reset completed.', resetNothing: 'There is currently nothing to reset; no new reset was consumed.',
  resetNoCredit: 'No quota reset is available.', resetAlready: 'This reset request was already processed.', resetFailed: 'Could not use the quota reset.',
  resetRenewLogin: 'Your sign-in expired. Sign in again.', resetExpired: 'This confirmation expired. Start again.',
  resetInProgress: 'A quota reset is already in progress.', resetTooEarly: 'Wait for the cooldown before confirming.',
  resetPhraseMismatch: 'The confirmation phrase does not match.', resetNotExhausted: 'The current Codex model quota is not exhausted.',
  resetAccountChanged: 'The signed-in account changed. Start again.',
  creditsNote: 'Shows only extra Credits, spending caps, or quota resets returned for this account or workspace; these are separate items.',
  creditsUsed: '{used} / {limit} credits used', spendReached: 'The monthly Credits spending cap has been reached.', unavailable: 'No data yet',
  quickQuotaSetting: 'Composer quota',
  quickQuotaBeta: 'Beta', quickQuotaStatus: 'Codex quota: {value}% remaining',
  speedTitle: 'Speed', speedStandard: 'Standard', speedStandardHint: 'Standard speed',
  speedFast: 'Fast', speedFastHint: '1.5x; higher Credits use',
  modelMenuAria: 'Model, effort, and speed', modelLabel: 'Model', effortLabel: 'Effort', providerDefault: 'Default', selectModel: 'Select model',
  modelsLoading: 'Loading models…', modelsEmpty: 'No models available.', effortsEmpty: 'This model provides no reasoning effort levels.', modelRetry: 'Retry', modelFailed: 'Could not load models: {value}', groupFailed: '{name}: {value}',
  imageGenerate: 'Generate image', imageGenerating: 'Generating…', imageGenerated: 'Generated', imageFailed: 'Generation failed',
  imageLabel: 'Generated image', imageOpen: 'View original', imageOpenNamed: 'View {value}', imageLoading: 'Loading image…', imageLoadFailed: 'Image failed to load. Click to retry', imagePreview: 'Image preview', imageClosePreview: 'Close preview',
}

const STYLE = `
.codexSubscription{display:flex;flex-direction:column;gap:10px;max-width:720px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.codexSubscription h2,.codexSubscription h3,.codexSubscription p{margin:0}.codexSubscriptionHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.codexSubscription h2{font-size:16px;line-height:24px;font-weight:500}.codexSubscription h3{font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionTag{border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionNote{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.codexSubscriptionUsageCard{padding:12px 14px;gap:9px}.codexSubscriptionPreferencesCard{padding:12px 14px;gap:10px}.codexSubscriptionPreference{min-height:32px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}.codexSubscriptionPreferenceCopy{display:flex;min-width:0;flex-direction:column;gap:2px}.codexSubscriptionPreferenceLabel{display:flex;align-items:center;gap:6px}
.codexSubscriptionSwitch{position:relative;flex:0 0 auto;width:32px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--dsw-alias-bg-module-platform);cursor:pointer}.codexSubscriptionSwitch:disabled{cursor:not-allowed;opacity:.5}.codexSubscriptionSwitch[aria-checked=true]{background:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-label-secondary)}.codexSubscriptionSwitchKnob{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);transition:transform 120ms var(--ds-ease-in-out)}.codexSubscriptionSwitch[aria-checked=true] .codexSubscriptionSwitchKnob{transform:translateX(14px)}
.codexSubscriptionSearch{display:flex;flex-direction:column;gap:7px}.codexSubscriptionSearchChoices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.codexSubscriptionSearchChoice{display:grid;grid-template-columns:14px minmax(0,1fr);align-items:center;column-gap:8px;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);padding:9px 10px;text-align:left;cursor:pointer}.codexSubscriptionSearchChoice:has(input:disabled){cursor:not-allowed;opacity:.5}.codexSubscriptionSearchChoice:has(input:checked){border-color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}.codexSubscriptionSearchChoice:has(input:focus-visible){outline:2px solid var(--dsw-alias-border-l3);outline-offset:2px}.codexSubscriptionSearchInput{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-label-primary);cursor:inherit}.codexSubscriptionSearchCopy{display:block;min-width:0;pointer-events:none}.codexSubscriptionSearchCopy strong,.codexSubscriptionSearchCopy span{display:block}.codexSubscriptionSearchCopy strong{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}.codexSubscriptionSearchChoice:has(input:checked) strong{color:var(--dsw-alias-label-primary)}.codexSubscriptionSearchCopy span{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionDivider{height:1px;background:var(--dsw-alias-border-l2)}
.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.codexSubscriptionStatus{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed)}.codexSubscriptionDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}.codexSubscriptionDot[data-state=disconnected]{background:var(--dsw-alias-state-error-primary)}
.codexSubscriptionActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.codexSubscriptionFlow{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.codexSubscriptionError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}.codexSubscriptionInput{width:100%;box-sizing:border-box}
.codexSubscriptionRecover{display:flex;align-items:center;justify-content:space-between;gap:12px}.codexSubscriptionRecover .codexSubscriptionError{flex:1}.codexSubscriptionRecover button{flex:0 0 auto}
.codexSubscriptionDiagnostics pre{max-height:240px;margin:0;padding:10px 12px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:11px/17px ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionSectionTitle{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.codexSubscriptionFreshness{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionRefresh{flex:0 0 auto;min-width:72px;width:max-content;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important}.codexSubscriptionRefresh *{white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important}
.codexSubscriptionEmpty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionLimits{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px}.codexSubscriptionLimit{min-width:0;border-radius:10px;padding:9px 12px;background:var(--dsw-alias-bg-module-platform);display:flex;flex-direction:column;gap:6px}
.codexSubscriptionLimitTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexSubscriptionLimitLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionLimit strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.codexSubscriptionLimit progress{width:100%;height:4px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}
.codexSubscriptionLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexSubscriptionLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionLimitMeta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionCreditSection{display:flex;flex-direction:column;gap:7px}.codexSubscriptionCreditNote{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionCreditRows{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.codexSubscriptionCreditBalance,.codexSubscriptionSpendLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionCreditBalance{display:flex;flex-direction:column;gap:6px}.codexSubscriptionCreditBalance span,.codexSubscriptionCreditLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionCreditBalance strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.codexSubscriptionResetSummary{display:flex;align-items:center;justify-content:space-between;gap:10px}.codexSubscriptionResetBalance{display:flex;flex-direction:column;gap:8px}.codexSubscriptionResetBalance .codexSubscriptionActions{justify-content:flex-start}.codexSubscriptionResetFlow{display:flex;flex-direction:column;gap:9px;border:1px solid var(--dsw-alias-state-warning-border,var(--dsw-alias-border-l2));border-radius:10px;padding:11px 12px;background:var(--dsw-alias-bg-module-platform)}.codexSubscriptionResetFlow h4{margin:0;font-size:13px;line-height:20px;font-weight:600}.codexSubscriptionResetWarning{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionResetCheck{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);cursor:pointer}.codexSubscriptionResetCheck input{margin:3px 0 0;accent-color:var(--dsw-alias-label-primary)}.codexSubscriptionResetPhrase{font:600 12px/18px ui-monospace,SFMono-Regular,Consolas,monospace}.codexSubscriptionResetFinal{border-color:var(--dsw-alias-state-error-primary)!important;color:var(--dsw-alias-state-error-primary)!important}.codexSubscriptionResetResult{font-size:12px;line-height:18px;color:var(--dsw-alias-state-success-primary)}
.codexSubscriptionSpendLimit{display:flex;flex-direction:column;gap:8px}.codexSubscriptionSpendTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexSubscriptionSpendTop strong{font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.codexSubscriptionSpendLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}.codexSubscriptionSpendLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexSubscriptionSpendLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionSpendLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexComposerQuota{display:inline-flex;align-items:center;flex:0 0 auto;height:28px;box-sizing:border-box;padding:0;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}
.codexModelSelect{position:relative;min-width:0}.codexModelSelectTrigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}.codexModelSelectTrigger:hover:not(:disabled),.codexModelSelectTrigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.codexModelSelectTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.codexModelSelectTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectBolt{display:block;flex:none;width:14px;height:14px;color:var(--dsw-alias-label-primary)}.codexModelSelectLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectEffort{flex:none;color:var(--dsw-alias-label-caption)}.codexModelSelectChevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms}.codexModelSelectTrigger[aria-expanded=true] .codexModelSelectChevron{transform:rotate(180deg)}
.codexModelSelectMenu,.codexModelSelectSubmenu{position:absolute;z-index:30;box-sizing:border-box;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);overflow:hidden}.codexModelSelectMenu{right:0;bottom:calc(100% + 8px)}.codexModelSelectSubmenu{right:calc(100% + 8px);bottom:0;min-width:min(230px,calc(100vw - 32px))}.codexModelSelectCell{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;height:40px;box-sizing:border-box;padding:0 10px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer}.codexModelSelectCell:hover,.codexModelSelectCell:focus-visible,.codexModelSelectCell[data-open=true]{background:var(--dsw-alias-interactive-bg-hover);outline:0}.codexModelSelectCell:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectCellLabel{flex:none;white-space:nowrap}.codexModelSelectCellValue{flex:auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectCellChevron{flex:none;color:var(--dsw-alias-label-tertiary)}.codexModelSelectGroups{min-height:0;max-height:352px;overflow-y:auto}.codexModelSelectGroup+.codexModelSelectGroup{margin-top:4px}.codexModelSelectGroupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:18px}.codexModelSelectOption{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;min-height:38px;box-sizing:border-box;padding:6px 8px;border:0;border-radius:10px;outline:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.codexModelSelectOption:hover:not(:disabled),.codexModelSelectOption:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.codexModelSelectOption:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectOptionCopy{display:flex;flex:1;min-width:0;flex-direction:column}.codexModelSelectOptionName{overflow:hidden;color:inherit;font-size:14px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectOptionDescription{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectCheck{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}.codexModelSelectStatus,.codexModelSelectEmpty{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.codexModelSelectError,.codexModelSelectWarning{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.codexModelSelectWarning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}.codexModelSelectRetry{flex:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.codexModelSelectMenu{overflow:visible}
.codexImageTool{display:flex;flex-direction:column;gap:8px;margin:4px 0;color:var(--dsw-alias-label-primary)}.codexImageToolRow{display:flex;align-items:center;min-height:24px;gap:8px;font-size:13px;line-height:20px}.codexImageToolIcon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary)}.codexImageToolIcon::before{content:'';width:8px;height:8px;border:1.5px solid currentColor;border-radius:3px}.codexImageTool[data-state=running] .codexImageToolIcon::before{border-radius:50%;border-right-color:transparent;animation:codexImageSpin 800ms linear infinite}.codexImageTool[data-state=error] .codexImageToolIcon::before{border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary)}.codexImageToolTitle{font-weight:500}.codexImageToolState{color:var(--dsw-alias-label-tertiary)}.codexImageToolError{margin:0 0 0 24px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}.codexImageToolGallery{margin-left:24px}.codexGeneratedImageFrame{display:flex;align-items:center;justify-content:center;width:min(240px,100%);min-height:120px;padding:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);cursor:pointer}.codexGeneratedImageFrame img{display:block;width:100%;max-height:240px;object-fit:contain}.codexGeneratedImageRetry{min-height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);cursor:pointer}.codexGeneratedImageLightbox{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:32px;border:0;background:rgba(0,0,0,.72)}.codexGeneratedImageLightbox img{display:block;max-width:min(1100px,calc(100vw - 64px));max-height:calc(100vh - 64px);object-fit:contain}.codexGeneratedImageClose{position:absolute;top:16px;right:16px;width:36px;height:36px;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(0,0,0,.48);color:#fff;font-size:20px;line-height:1;cursor:pointer}@keyframes codexImageSpin{to{transform:rotate(360deg)}}
@container (max-width:560px){.codexSubscriptionCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{align-items:flex-start;flex-direction:column}.codexSubscriptionActions{width:100%}.codexSubscriptionSearchChoices{grid-template-columns:1fr}}
@media(max-width:640px){.codexSubscriptionCard{padding:14px}}
`

const unwrap = response => {
  if (!response?.ok) throw new Error(response?.error?.message ?? 'Codex RPC failed')
  return response.value
}
const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text)
const hours = seconds => Math.round((seconds / 3600) * 10) / 10
const percent = value => Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })
const isApproximateWindow = (seconds, expected) => seconds >= expected * 0.95 && seconds <= expected * 1.05
const windowLabel = (seconds, t) => {
  if (isApproximateWindow(seconds, 18_000)) return t('windowFiveHours')
  if (isApproximateWindow(seconds, 86_400)) return t('windowDaily')
  if (isApproximateWindow(seconds, 604_800)) return t('windowWeekly')
  if (isApproximateWindow(seconds, 2_592_000)) return t('windowMonthly')
  if (isApproximateWindow(seconds, 31_536_000)) return t('windowAnnual')
  return seconds >= 86_400 && seconds % 86_400 === 0
    ? fill(t('windowDays'), { value: seconds / 86_400 })
    : fill(t('windowHours'), { value: hours(seconds) })
}
const validDate = value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}

function CodexGeneratedImage({ attachment, loadImage, t }) {
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState(false)
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState()
  const closeRef = useRef(null)
  const triggerRef = useRef(null)
  useEffect(() => {
    let live = true
    setError(false)
    setSrc(undefined)
    void loadImage(attachment)
      .then(value => { if (live) setSrc(value) })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [attachment, loadImage, attempt])
  useEffect(() => {
    if (!open) return undefined
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      } else if (event.key === 'Tab') {
        event.preventDefault()
        closeRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    closeRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      triggerRef.current?.focus()
    }
  }, [open])
  const label = attachment.name ?? t('imageLabel')
  if (error) {
    return <button type="button" className="codexGeneratedImageRetry" onClick={() => setAttempt(value => value + 1)}>{t('imageLoadFailed')}</button>
  }
  return <>
    <button ref={triggerRef} type="button" className="codexGeneratedImageFrame" title={t('imageOpen')} aria-label={fill(t('imageOpenNamed'), { value: label })} onClick={() => { if (src !== undefined) setOpen(true) }}>
      {src === undefined ? <span>{t('imageLoading')}</span> : <img src={src} alt={label} />}
    </button>
    {!open || src === undefined ? null : <div className="codexGeneratedImageLightbox" role="dialog" aria-modal="true" aria-label={t('imagePreview')} onClick={() => setOpen(false)}>
      <img src={src} alt={label} onClick={event => event.stopPropagation()} />
      <button ref={closeRef} type="button" className="codexGeneratedImageClose" aria-label={t('imageClosePreview')} onClick={() => setOpen(false)}>×</button>
    </div>}
  </>
}

function CodexImageToolRow({ block, loadImage, t }) {
  const settled = block?.kind === 'tool-result'
  const image = settled
    ? block.content.find(item => item?.type === 'image' && item.attachment !== undefined)
    : undefined
  const failed = settled && block.isError === true
  const state = !settled ? 'running' : failed ? 'error' : 'done'
  const status = !settled ? t('imageGenerating') : failed ? t('imageFailed') : t('imageGenerated')
  const error = failed
    ? block.content.find(item => item?.type === 'text' && typeof item.text === 'string')?.text
    : undefined
  return <div className="codexImageTool" data-state={state}>
    <div className="codexImageToolRow"><span className="codexImageToolIcon" aria-hidden="true" /><span className="codexImageToolTitle">{t('imageGenerate')}</span><span className="codexImageToolState">{status}</span></div>
    {image === undefined ? null : <div className="codexImageToolGallery"><CodexGeneratedImage attachment={image.attachment} loadImage={loadImage} t={t} /></div>}
    {error === undefined ? null : <p className="codexImageToolError">{error}</p>}
  </div>
}

function createPreferenceController(scope, rpc) {
  let updating = false
  let error = false
  let fallbackStatus = 'loading'
  let fallback
  let failedPatch
  let generation = 0
  const nativeSnapshot = () => scope.getSnapshot()
  const read = () => {
    const native = nativeSnapshot()
    const current = native.status === 'ready'
      ? native
      : fallbackStatus === 'ready'
        ? fallback
        : native
    return Object.freeze({
      status: updating ? 'updating' : current.status,
      visible: current.value?.[QUICK_QUOTA_FIELD] === true,
      searchProvider: normalizeSearchProvider(current.value?.[SEARCH_PROVIDER_FIELD]),
      speedMode: normalizeSpeedMode(current.value?.[SPEED_MODE_FIELD]),
      writable: !updating && current.status === 'ready' && current.writable === true,
      error,
    })
  }
  let snapshot = read()
  const listeners = new Set()
  const publish = () => {
    snapshot = read()
    for (const listener of listeners) listener()
  }
  const disposeScope = scope.subscribe(() => {
    error = false
    failedPatch = undefined
    publish()
  })
  const acceptFallback = value => {
    fallbackStatus = 'ready'
    fallback = {
      status: 'ready',
      value: {
        [QUICK_QUOTA_FIELD]: value?.[QUICK_QUOTA_FIELD] === true,
        [SEARCH_PROVIDER_FIELD]: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
        [SPEED_MODE_FIELD]: normalizeSpeedMode(value?.[SPEED_MODE_FIELD]),
      },
      writable: value?.writable === true,
    }
  }
  const load = async () => {
    const current = ++generation
    updating = false
    fallbackStatus = 'loading'
    fallback = undefined
    error = false
    publish()
    const native = nativeSnapshot()
    if (native.status === 'ready') return
    try {
      const value = unwrap(await rpc.call(CHANNEL, 'preferences/status', {}))
      if (current !== generation || nativeSnapshot().status === 'ready') return
      acceptFallback(value)
      publish()
    } catch {
      if (current !== generation || nativeSnapshot().status === 'ready') return
      fallbackStatus = 'unavailable'
      publish()
    }
  }
  const set = async patch => {
    if (snapshot.status !== 'ready' || snapshot.writable !== true) return
    const current = ++generation
    const entries = Object.entries(patch)
    updating = true
    error = false
    failedPatch = undefined
    publish()
    try {
      const native = nativeSnapshot()
      if (native.status === 'ready') {
        for (const [field, value] of entries) {
          if (current !== generation) return
          await scope.set(field, value)
        }
        if (current !== generation) return
        const accepted = nativeSnapshot().value
        error = entries.some(([field, value]) => accepted?.[field] !== value)
      } else {
        const value = unwrap(await rpc.call(CHANNEL, 'preferences/update', patch))
        if (current !== generation) return
        acceptFallback(value)
      }
    } catch {
      if (current === generation) {
        error = true
        failedPatch = patch
      }
    } finally {
      if (current === generation) {
        updating = false
        publish()
      }
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load,
    set,
    retry: () => failedPatch === undefined ? load() : set(failedPatch),
    dispose: disposeScope,
  }
}

const usePreferenceSnapshot = preference => useSyncExternalStore(
  preference.subscribe,
  preference.getSnapshot,
)

const notifyQuickQuota = () => window.dispatchEvent(new Event(QUICK_QUOTA_REFRESH_EVENT))

function useQuickQuota(rpc, enabled, model) {
  const [quota, setQuota] = useState()
  useEffect(() => {
    if (!enabled) {
      setQuota(undefined)
      return undefined
    }
    let live = true
    let loading = false
    const load = async () => {
      if (loading) return
      loading = true
      try {
        const account = unwrap(await rpc.call(CHANNEL, 'status', {}))
        if (!live) return
        if (account?.authenticated !== true) {
          setQuota(undefined)
          return
        }
        const usage = unwrap(await rpc.call(CHANNEL, 'usage', { force: false }))
        if (live) setQuota(selectModelQuota(usage, model))
      } catch {
        if (live) setQuota(undefined)
      } finally {
        loading = false
      }
    }
    const refresh = () => { void load() }
    void load()
    const timer = window.setInterval(refresh, QUICK_QUOTA_REFRESH_MS)
    window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    return () => {
      live = false
      window.clearInterval(timer)
      window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh)
    }
  }, [rpc, enabled, model])
  return quota
}

function QuickQuotaPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const visible = snapshot.visible
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  return <div className="codexSubscriptionPreference">
    <div className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionPreferenceLabel">{t('quickQuotaSetting')}<span className="codexSubscriptionTag">{t('quickQuotaBeta')}</span></span></div>
    <button className="codexSubscriptionSwitch" type="button" role="switch" aria-checked={visible} aria-label={t('quickQuotaSetting')} disabled={!writable} onClick={() => { void preference.set({ [QUICK_QUOTA_FIELD]: !visible }) }}>
      <span className="codexSubscriptionSwitchKnob" aria-hidden="true" />
    </button>
  </div>
}

function SearchProviderPreference({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  const writable = snapshot.status === 'ready' && snapshot.writable === true
  const choice = (value, label, hint) => <label className="codexSubscriptionSearchChoice"><input className="codexSubscriptionSearchInput" type="radio" name="codex-subscription-search-provider" checked={snapshot.searchProvider === value} disabled={!writable} onChange={() => { void preference.set({ [SEARCH_PROVIDER_FIELD]: value }) }} /><span className="codexSubscriptionSearchCopy"><strong>{label}</strong><span>{hint}</span></span></label>
  return <div className="codexSubscriptionSearch">
    <h3>{t('searchTitle')}</h3>
    <div className="codexSubscriptionSearchChoices" role="radiogroup" aria-label={t('searchTitle')}>
      {choice(SEARCH_PROVIDER_DSH, t('searchDsh'), t('searchDshHint'))}
      {choice(SEARCH_PROVIDER_CODEX, t('searchCodex'), t('searchCodexHint'))}
    </div>
  </div>
}

function PreferencesCard({ preference, t }) {
  const snapshot = usePreferenceSnapshot(preference)
  return <div className="codexSubscriptionCard codexSubscriptionPreferencesCard">
    <SearchProviderPreference preference={preference} t={t} />
    <div className="codexSubscriptionDivider" />
    <QuickQuotaPreference preference={preference} t={t} />
    {snapshot.error ? <div className="codexSubscriptionRecover" role="alert"><p className="codexSubscriptionError">{t('preferenceFailed')}</p><Button type="button" variant="outline" onClick={() => { void preference.retry() }}>{t('preferenceRetry')}</Button></div> : null}
  </div>
}

function CodexComposerQuota({ preference, rpc, t, directory }) {
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const modelState = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
  )
  const current = modelState.current
  const codex = current?.provider === 'openai-codex'
  const quotaEnabled = preferenceSnapshot.status === 'ready' && preferenceSnapshot.visible && codex
  const quota = useQuickQuota(rpc, quotaEnabled, current?.model)
  if (!quotaEnabled || quota === undefined) return null
  const value = percent(quota.remainingPercent)
  const label = fill(t('quickQuotaStatus'), { value })
  return <span className="codexComposerQuota" role="status" aria-label={label} title={label}>{value}%</span>
}

function CodexModelSelect({ locked, available, directory, load, select, preference, t }) {
  const state = useSyncExternalStore(directory.subscribe, directory.getSnapshot)
  const preferenceSnapshot = usePreferenceSnapshot(preference)
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState('root')
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const id = useId()
  const choices = useMemo(() => state.groups.flatMap(group => group.models.map(model => ({
    group,
    model,
    selection: {
      provider: group.id,
      model: model.id,
      ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }),
    },
  }))), [state.groups])
  const currentChoice = choices.find(choice => choice.selection.provider === state.current?.provider && choice.selection.model === state.current?.model)
  const reasoning = currentChoice?.model.reasoning
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('providerDefault')
      : reasoning.efforts.find(level => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo(() => reasoning === undefined ? [] : [
    ...(reasoning.defaultEffort === undefined ? [{ key: 'provider-default', effort: undefined, label: t('providerDefault') }] : []),
    ...reasoning.efforts.map(effort => ({
      key: `effort:${effort.id}`,
      effort: effort.id,
      label: effort.name,
      ...(effort.description === undefined ? {} : { description: effort.description }),
    })),
  ], [reasoning, t])
  const modelLabel = currentChoice?.model.name ?? t('selectModel')
  const speedSupported = state.current?.provider === 'openai-codex' && supportsCodexFastMode(state.current?.model)
  const speedWritable = preferenceSnapshot.status === 'ready' && preferenceSnapshot.writable === true
  const fast = speedSupported && preferenceSnapshot.speedMode === SPEED_MODE_FAST
  const busy = state.status === 'selecting'

  useEffect(() => {
    if (available) load()
  }, [available, load])
  useEffect(() => {
    if (!open) return undefined
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
        setPane('root')
      }
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open])
  useEffect(() => {
    if (!speedSupported && pane === 'speed') setPane('root')
  }, [pane, speedSupported])
  if (!available) return null

  const close = (restoreFocus = false) => {
    setOpen(false)
    setPane('root')
    if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus())
  }
  const settleSelection = accepted => {
    if (accepted) close(true)
  }
  const chooseModel = selection => {
    if (state.current?.provider === selection.provider && state.current.model === selection.model) {
      close(true)
      return
    }
    void select(selection).then(settleSelection)
  }
  const chooseEffort = effort => {
    if (state.current === null) return
    if (effectiveEffort === effort) {
      close(true)
      return
    }
    void select({
      provider: state.current.provider,
      model: state.current.model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    }).then(settleSelection)
  }
  const chooseSpeed = speedMode => {
    close(true)
    void preference.set({ [SPEED_MODE_FIELD]: speedMode })
  }
  const option = ({ key, label, description, selected, disabled, onClick }) => <button
    key={key}
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    className="codexModelSelectOption"
    disabled={disabled}
    onClick={onClick}
  >
    <span className="codexModelSelectOptionCopy"><span className="codexModelSelectOptionName">{label}</span>{description === undefined ? null : <span className="codexModelSelectOptionDescription">{description}</span>}</span>
    <span className="codexModelSelectCheck">{selected ? <IconCheckOutline16 /> : null}</span>
  </button>
  const cell = (target, label, value) => <button
    type="button"
    role="menuitem"
    className="codexModelSelectCell"
    data-open={pane === target}
    aria-haspopup="menu"
    aria-expanded={pane === target}
    onClick={() => setPane(current => current === target ? 'root' : target)}
  >
    <span className="codexModelSelectCellLabel">{label}</span>
    <span className="codexModelSelectCellValue">{value}</span>
    <IconChevronRightOutline14 className="codexModelSelectCellChevron" />
  </button>

  let submenu = null
  if (pane === 'model') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('modelLabel')}>
      {state.status === 'loading' ? <div className="codexModelSelectStatus">{t('modelsLoading')}</div> : null}
      {state.error === null ? null : <div className="codexModelSelectError"><span>{fill(t('modelFailed'), { value: state.error })}</span><button className="codexModelSelectRetry" type="button" onClick={load}>{t('modelRetry')}</button></div>}
      {state.failures.map(failure => <div className="codexModelSelectWarning" key={failure.id}>{fill(t('groupFailed'), { name: failure.name, value: failure.message })}</div>)}
      <div className="codexModelSelectGroups scrollable">{state.groups.map(group => <section className="codexModelSelectGroup" role="group" aria-labelledby={`${id}-${group.id}`} key={group.id}>
        <div className="codexModelSelectGroupTitle" id={`${id}-${group.id}`}>{group.name}</div>
        {group.models.map(model => option({
          key: model.id,
          label: model.name,
          description: model.description,
          selected: state.current?.provider === group.id && state.current.model === model.id,
          disabled: busy,
          onClick: () => chooseModel({ provider: group.id, model: model.id }),
        }))}
      </section>)}</div>
      {state.status === 'ready' && choices.length === 0 ? <div className="codexModelSelectEmpty">{t('modelsEmpty')}</div> : null}
    </div>
  } else if (pane === 'effort') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('effortLabel')}>
      {effortChoices.length === 0 ? <div className="codexModelSelectEmpty">{t('effortsEmpty')}</div> : effortChoices.map(level => option({
        key: level.key,
        label: level.label,
        description: level.description,
        selected: effectiveEffort === level.effort,
        disabled: busy,
        onClick: () => chooseEffort(level.effort),
      }))}
    </div>
  } else if (pane === 'speed') {
    submenu = <div className="codexModelSelectSubmenu" role="menu" aria-label={t('speedTitle')}>
      {option({ key: SPEED_MODE_STANDARD, label: t('speedStandard'), description: t('speedStandardHint'), selected: !fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_STANDARD) })}
      {option({ key: SPEED_MODE_FAST, label: t('speedFast'), description: t('speedFastHint'), selected: fast, disabled: !speedWritable, onClick: () => chooseSpeed(SPEED_MODE_FAST) })}
    </div>
  }

  return <div className="codexModelSelect" ref={rootRef} onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    if (pane === 'root') close(true)
    else setPane('root')
  }}>
    <button
      ref={triggerRef}
      type="button"
      className="codexModelSelectTrigger"
      aria-label={modelLabel}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? `${id}-menu` : undefined}
      title={modelLabel}
      disabled={locked}
      onClick={() => open ? close() : (setPane('root'), setOpen(true), load())}
    >
      {fast && <BoltIcon className="codexModelSelectBolt" aria-hidden="true" />}
      <span className="codexModelSelectLabel">{modelLabel}</span>
      {effortLabel === undefined ? null : <span className="codexModelSelectEffort">{effortLabel}</span>}
      <IconChevronDownOutline14 className="codexModelSelectChevron" />
    </button>
    {open ? <div className="codexModelSelectMenu" id={`${id}-menu`} role="menu" aria-label={t('modelMenuAria')} aria-busy={state.status === 'loading' || busy}>
      {cell('model', t('modelLabel'), modelLabel)}
      {reasoning === undefined ? null : cell('effort', t('effortLabel'), effortLabel)}
      {speedSupported && cell('speed', t('speedTitle'), t(fast ? 'speedFast' : 'speedStandard'))}
      {submenu}
    </div> : null}
  </div>
}

function AccountCard({ rpc, t, account, setAccount, onSignedOut }) {
  const [flow, setFlow] = useState()
  const [manualCode, setManualCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const call = (endpoint, payload = {}) => rpc.call(CHANNEL, endpoint, payload).then(unwrap)

  useEffect(() => {
    if (flow?.id === undefined || ['authenticated', 'failed', 'cancelled'].includes(flow.phase)) return undefined
    const timer = window.setInterval(() => {
      void readLoginProgress({
        flow,
        readFlow: () => call('login/status', { id: flow.id }),
        readAccount: () => call('status'),
      }).then(next => {
        setFlow(next.flow)
        setError(undefined)
        if (next.account !== undefined) {
          setAccount(next.account)
          notifyQuickQuota()
        }
      }).catch(() => setError(t('failed')))
    }, 800)
    return () => window.clearInterval(timer)
  }, [flow?.id, flow?.phase])

  const begin = method => {
    setBusy(true); setError(undefined)
    void call('login/start', { method, openExternal: true }).then(setFlow)
      .catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const cancel = () => {
    if (flow?.id === undefined) return
    setBusy(true)
    void call('login/cancel', { id: flow.id }).then(next => {
      setFlow(next)
      return call('status').then(account => {
        if (account.authenticated === true) {
          setAccount(account)
          setFlow({ ...next, phase: 'authenticated', authenticated: true })
          setError(undefined)
          notifyQuickQuota()
        }
      })
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const submit = event => {
    event.preventDefault()
    if (flow?.id === undefined || manualCode.trim() === '') return
    setBusy(true)
    void call('login/submit', { id: flow.id, value: manualCode.trim() }).then(next => {
      setManualCode(''); setFlow(next)
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const logout = () => {
    setBusy(true); setError(undefined)
    void call('logout').then(next => {
      setAccount(next); setFlow(undefined); onSignedOut(); notifyQuickQuota()
    }).catch(() => setError(t('failed'))).finally(() => setBusy(false))
  }
  const signedIn = account?.authenticated === true
  const accountReady = account !== undefined

  return <div className="codexSubscriptionCard">
    <div className="codexSubscriptionAccountRow">
      <div className="codexSubscriptionStatus" role="status" aria-live="polite"><span className="codexSubscriptionDot" data-state={accountReady ? signedIn ? 'connected' : 'disconnected' : 'loading'} aria-hidden="true" />{accountReady ? signedIn ? t('connected') : t('disconnected') : t('accountLoading')}</div>
      <div className="codexSubscriptionActions">{signedIn ? <Button type="button" variant="outline" disabled={busy} onClick={logout}>{t('logout')}</Button> : accountReady && (flow === undefined || ['failed', 'cancelled'].includes(flow.phase)) ? <><Button type="button" variant="primary" disabled={busy} onClick={() => begin('browser')}>{t('browserLogin')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => begin('device_code')}>{t('deviceLogin')}</Button></> : null}</div>
    </div>
    {!signedIn && flow?.phase === 'waiting_device' ? <div className="codexSubscriptionFlow"><p>{t('deviceHint')}</p><code className="codexSubscriptionCode">{flow.deviceCode?.userCode}</code><a href={flow.deviceCode?.verificationUri} target="_blank" rel="noreferrer">{t('openLogin')}</a><p>{t('waiting')}</p></div> : null}
    {!signedIn && flow?.phase === 'waiting_input' ? <form className="codexSubscriptionFlow" onSubmit={submit}><p>{t('manualCode')}</p><Input className="codexSubscriptionInput" value={manualCode} onChange={event => setManualCode(event.currentTarget.value)} autoComplete="off" spellCheck={false} /><div className="codexSubscriptionActions"><Button type="submit" variant="primary" disabled={busy || manualCode.trim() === ''}>{t('submit')}</Button><Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div></form> : null}
    {!signedIn && flow !== undefined && ['starting', 'waiting_browser'].includes(flow.phase) ? <div className="codexSubscriptionFlow"><p>{t('waiting')}</p>{flow.authUrl === undefined ? null : <a href={flow.authUrl} target="_blank" rel="noreferrer">{t('openLogin')}</a>}<Button type="button" variant="outline" disabled={busy} onClick={cancel}>{t('cancel')}</Button></div> : null}
    {flow?.phase === 'failed' || error !== undefined ? <p className="codexSubscriptionError" role="alert">{error ?? t('failed')}</p> : null}
  </div>
}

function AccountFailureCard({ retry, t }) {
  return <div className="codexSubscriptionCard codexSubscriptionRecover" role="alert">
    <p className="codexSubscriptionError">{t('loadFailed')}</p>
    <Button type="button" variant="outline" onClick={retry}>{t('accountRetry')}</Button>
  </div>
}

function DiagnosticsCard({ rpc, t }) {
  const [report, setReport] = useState()
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const load = () => {
    setBusy(true); setError(false); setCopied(false)
    void rpc.call(CHANNEL, 'diagnostics', {}).then(unwrap).then(setReport)
      .catch(() => setError(true)).finally(() => setBusy(false))
  }
  const copy = () => {
    if (report === undefined) return
    void navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => setCopied(true)).catch(() => setError(true))
  }
  return <div className="codexSubscriptionCard codexSubscriptionDiagnostics">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('diagnostics')}</h3><p className="codexSubscriptionNote">{t('diagnosticsHint')}</p></div>
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={busy} onClick={load}>{t('diagnosticsLoad')}</Button>{report === undefined ? null : <Button type="button" variant="outline" onClick={copy}>{copied ? t('diagnosticsCopied') : t('diagnosticsCopy')}</Button>}</div>
    </div>
    {report === undefined ? null : <pre>{JSON.stringify(report, null, 2)}</pre>}
    {error ? <p className="codexSubscriptionError" role="alert">{t('diagnosticsFailed')}</p> : null}
  </div>
}

function ResetTime({ resetsAt, t }) {
  const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1_000) : undefined
  if (date === undefined) return <span>{t('resetUnknown')}</span>
  const value = date.toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  return <time dateTime={date.toISOString()} title={date.toLocaleString()}>{fill(t('resets'), { value })}</time>
}

function ResetCreditControl({ rpc, t, count, exhausted, onConsumed }) {
  const [challenge, setChallenge] = useState()
  const [resetBusy, setResetBusy] = useState(false)
  const [resetAcknowledged, setResetAcknowledged] = useState(false)
  const [resetPhrase, setResetPhrase] = useState('')
  const [resetCountdown, setResetCountdown] = useState(0)
  const [resetError, setResetError] = useState()
  const [resetResult, setResetResult] = useState()

  useEffect(() => {
    if (challenge === undefined) { setResetCountdown(0); return undefined }
    const update = () => setResetCountdown(Math.max(0, Math.ceil((challenge.readyAt - Date.now()) / 1_000)))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [challenge])

  const prepareReset = () => {
    if (resetBusy || !exhausted) return
    setResetBusy(true); setResetError(undefined); setResetResult(undefined)
    void rpc.call(CHANNEL, 'reset-credit/prepare', {}).then(unwrap)
      .then(next => { setChallenge(next); setResetAcknowledged(false); setResetPhrase('') })
      .catch(error => setResetError(resetCreditErrorText(error, t)))
      .finally(() => setResetBusy(false))
  }
  const cancelReset = () => {
    if (resetBusy) return
    setChallenge(undefined); setResetAcknowledged(false); setResetPhrase(''); setResetError(undefined)
  }
  const resetReady = challenge !== undefined
    && resetAcknowledged && resetPhrase === challenge.confirmPhrase && resetCountdown === 0
  const consumeReset = () => {
    if (resetBusy) return
    if (!resetReady) return
    setResetBusy(true); setResetError(undefined); setResetResult(undefined)
    void rpc.call(CHANNEL, 'reset-credit/consume', {
      challengeId: challenge.challengeId,
      phrase: resetPhrase,
    }).then(unwrap).then(result => {
      setChallenge(undefined); setResetAcknowledged(false); setResetPhrase('')
      const message = result.code === 'reset' ? t('resetSuccess')
        : result.code === 'nothing_to_reset' ? t('resetNothing')
          : result.code === 'no_credit' ? t('resetNoCredit') : t('resetAlready')
      setResetResult(message)
      onConsumed()
    }).catch(error => setResetError(resetCreditErrorText(error, t))).finally(() => setResetBusy(false))
  }

  return <div className="codexSubscriptionResetBalance">
    {challenge === undefined ? <>
      <div className="codexSubscriptionResetSummary"><strong>{fill(t('resetCreditsValue'), { count })}</strong><div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={!exhausted || resetBusy} aria-busy={resetBusy} title={!exhausted ? t('resetUnavailable') : undefined} onClick={prepareReset}>{resetBusy ? t('resetPreparing') : t('resetUse')}</Button></div></div>
    </> : <div className="codexSubscriptionResetFlow" role="group" aria-labelledby="codex-reset-confirm-title">
      <h4 id="codex-reset-confirm-title">{challenge.title ?? t('resetConfirmTitle')}</h4>
      {challenge.description ? <p className="codexSubscriptionResetWarning">{challenge.description}</p> : null}
      <p className="codexSubscriptionResetWarning">{t('resetWarning')}</p>
      <label className="codexSubscriptionResetCheck"><input type="checkbox" checked={resetAcknowledged} disabled={resetBusy} onChange={event => setResetAcknowledged(event.target.checked)} /><span>{t('resetAcknowledge')}</span></label>
      <label className="codexSubscriptionPreferenceCopy"><span className="codexSubscriptionCreditLabel">{fill(t('resetTypeHint'), { phrase: challenge.confirmPhrase })}</span><Input className="codexSubscriptionInput codexSubscriptionResetPhrase" value={resetPhrase} disabled={resetBusy} autoComplete="off" spellCheck={false} onChange={event => setResetPhrase(event.target.value)} /></label>
      {resetCountdown > 0 ? <p className="codexSubscriptionCreditNote" role="status">{fill(t('resetWait'), { count: resetCountdown })}</p> : null}
      <div className="codexSubscriptionActions"><Button type="button" variant="outline" disabled={resetBusy} onClick={cancelReset}>{t('cancel')}</Button><Button className="codexSubscriptionResetFinal" type="button" variant="outline" disabled={!resetReady || resetBusy} aria-busy={resetBusy} onClick={consumeReset}>{resetBusy ? t('resetUsing') : t('resetFinal')}</Button></div>
    </div>}
    {resetResult ? <p className="codexSubscriptionResetResult" role="status">{resetResult}</p> : null}
    {resetError ? <p className="codexSubscriptionError" role="alert">{resetError || t('resetFailed')}</p> : null}
  </div>
}

function resetCreditErrorText(error, t) {
  const key = new Map([
    ['ChatGPT subscription is not signed in', 'resetRenewLogin'],
    ['ChatGPT sign-in needs to be renewed', 'resetRenewLogin'],
    ['No quota reset is available', 'resetNoCredit'],
    ['No usable quota reset is available', 'resetNoCredit'],
    ['The available quota reset expires too soon', 'resetExpired'],
    ['This quota reset confirmation is no longer valid', 'resetExpired'],
    ['This quota reset is already in progress', 'resetInProgress'],
    ['Wait before confirming this quota reset', 'resetTooEarly'],
    ['The quota reset confirmation phrase does not match', 'resetPhraseMismatch'],
    ['The current Codex quota is not exhausted', 'resetNotExhausted'],
    ['The signed-in ChatGPT account changed', 'resetAccountChanged'],
  ]).get(error instanceof Error ? error.message : '')
  return t(key ?? 'resetFailed')
}

function UsageCard({ rpc, t, signedIn, resetKey }) {
  const [usage, setUsage] = useState()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState()
  const request = useRef(0)
  const load = force => {
    if (!signedIn) return
    const id = ++request.current
    setBusy(true); setError(undefined)
    void rpc.call(CHANNEL, 'usage', { force }).then(unwrap)
      .then(next => {
        if (request.current === id) {
          setUsage(next)
          if (force) notifyQuickQuota()
        }
      })
      .catch(error => { if (request.current === id) setError(error.message) })
      .finally(() => { if (request.current === id) setBusy(false) })
  }
  useEffect(() => {
    if (signedIn) load(false)
    else { request.current += 1; setUsage(undefined); setError(undefined); setBusy(false) }
    return () => { request.current += 1 }
  }, [signedIn, resetKey])
  const visibleUsage = signedIn ? usage : undefined
  const limits = visibleUsage?.rateLimits ?? []
  const exhausted = limits.some(limit => limit.id !== 'code_review'
    && limit.windows.some(window => window.usedPercent >= 100))
  const hasUsageDetails = limits.length > 0 || visibleUsage?.credits !== undefined
    || visibleUsage?.individualLimit !== undefined || visibleUsage?.resetCredits?.availableCount > 0
  const fetchedAt = typeof visibleUsage?.fetchedAt === 'number' ? validDate(visibleUsage.fetchedAt) : undefined
  return <div className="codexSubscriptionCard codexSubscriptionUsageCard">
    <div className="codexSubscriptionSectionHead">
      <div className="codexSubscriptionSectionTitle"><h3>{t('usage')}</h3>{fetchedAt === undefined ? null : <time className="codexSubscriptionFreshness" dateTime={fetchedAt.toISOString()}>{fill(t('usageUpdated'), { value: fetchedAt.toLocaleString() })}</time>}</div>
      <Button className="codexSubscriptionRefresh" type="button" variant="outline" disabled={!signedIn || busy} aria-busy={busy} onClick={() => load(true)}>{busy ? t('refreshing') : t('refresh')}</Button>
    </div>
    <div aria-live="polite">
      {!signedIn ? <p className="codexSubscriptionEmpty">{t('noUsage')}</p> : null}
      {signedIn && busy && usage === undefined ? <p className="codexSubscriptionEmpty" role="status">{t('usageLoading')}</p> : null}
      {signedIn && !busy && error === undefined && usage !== undefined && !hasUsageDetails ? <p className="codexSubscriptionEmpty" role="status">{t('usageEmpty')}</p> : null}
    </div>
    {error === undefined ? null : <p className="codexSubscriptionError" role="alert">{error}</p>}
    {visibleUsage?.spendControlReached === true ? <p className="codexSubscriptionError" role="alert">{t('spendReached')}</p> : null}
    {limits.length === 0 ? null : <div className="codexSubscriptionLimits">{limits.flatMap(limit => limit.windows.map((window, index) => <div className="codexSubscriptionLimit" key={`${limit.id}-${window.windowSeconds}-${index}`}>
        <div className="codexSubscriptionLimitTop"><span className="codexSubscriptionLimitLabel">{limit.name ?? limit.id}</span><strong>{percent(window.remainingPercent)}%</strong></div>
        <progress max="100" value={window.remainingPercent} aria-label={`${limit.name ?? limit.id} ${fill(t('remaining'), { value: percent(window.remainingPercent) })}`} />
        <div className="codexSubscriptionLimitMeta"><span>{windowLabel(window.windowSeconds, t)}</span><ResetTime resetsAt={window.resetsAt} t={t} /></div>
      </div>))}</div>}
    {visibleUsage?.credits === undefined && visibleUsage?.individualLimit === undefined && !(visibleUsage?.resetCredits?.availableCount > 0) ? null : <div className="codexSubscriptionCreditSection">
      <p className="codexSubscriptionCreditNote">{t('creditsNote')}</p>
      <div className="codexSubscriptionCreditRows">
        {visibleUsage?.credits ? <div className="codexSubscriptionCreditBalance"><span>{t('creditsBalance')}</span><strong>{visibleUsage.credits.unlimited ? t('unlimited') : `${visibleUsage.credits.balance ?? t('unavailable')} ${t('creditsUnit')}`}</strong></div> : null}
        {visibleUsage?.resetCredits?.availableCount > 0 ? <div className="codexSubscriptionCreditBalance"><span>{t('resetCredits')}</span><ResetCreditControl rpc={rpc} t={t} count={visibleUsage.resetCredits.availableCount} exhausted={exhausted} onConsumed={() => load(true)} /></div> : null}
        {visibleUsage?.individualLimit ? <div className="codexSubscriptionSpendLimit">
          <div className="codexSubscriptionSpendTop"><span className="codexSubscriptionCreditLabel">{t('monthlyCreditLimit')}</span><strong>{fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}</strong></div>
          <progress max="100" value={visibleUsage.individualLimit.remainingPercent} aria-label={`${t('monthlyCreditLimit')} ${fill(t('remaining'), { value: percent(visibleUsage.individualLimit.remainingPercent) })}`} />
          <div className="codexSubscriptionLimitMeta"><span>{fill(t('creditsUsed'), { used: visibleUsage.individualLimit.used, limit: visibleUsage.individualLimit.limit })}</span><ResetTime resetsAt={visibleUsage.individualLimit.resetsAt} t={t} /></div>
        </div> : null}
      </div>
    </div>}
  </div>
}

function CodexSection({ preference, rpc, t }) {
  const [account, setAccount] = useState()
  const [accountError, setAccountError] = useState()
  const [resetKey, setResetKey] = useState(0)
  const accountRequest = useRef(0)
  const loadAccount = () => {
    const id = ++accountRequest.current
    setAccount(undefined)
    setAccountError(undefined)
    void rpc.call(CHANNEL, 'status', {}).then(unwrap).then(next => {
      if (accountRequest.current === id) setAccount(next)
    }).catch(() => {
      if (accountRequest.current === id) setAccountError(true)
    })
  }
  useEffect(() => {
    loadAccount()
    return () => { accountRequest.current += 1 }
  }, [])
  return <section className="codexSubscription">
    <div className="codexSubscriptionHead"><h2>{t('title')}</h2></div>
    {accountError === undefined ? <AccountCard rpc={rpc} t={t} account={account} setAccount={setAccount} onSignedOut={() => setResetKey(value => value + 1)} /> : <AccountFailureCard retry={loadAccount} t={t} />}
    <PreferencesCard preference={preference} t={t} />
    {account === undefined ? null : <UsageCard rpc={rpc} t={t} signedIn={account.authenticated === true} resetKey={resetKey} />}
    <DiagnosticsCard rpc={rpc} t={t} />
  </section>
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'codex-subscription: copy')
  ctx.effect(() => {
    const tag = document.createElement('style')
    tag.dataset.plugin = 'dsh-codex-subscription'
    tag.textContent = STYLE
    document.head.append(tag)
    return () => tag.remove()
  }, 'codex-subscription: style')
  const connection = ctx.get('connection')
  const scope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE })
  const preference = createPreferenceController(scope, connection.rpc)
  ctx.effect(() => {
    void preference.load()
    const disposeReset = ctx.on('connection/reset', () => { void preference.load() })
    return () => {
      disposeReset?.()
      preference.dispose()
    }
  }, 'codex-subscription: preferences')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'codex-subscription', order: 15,
    label: () => t('nav'), locale: NS, inject: () => ({ preference, rpc: connection.rpc, t }),
  }, CodexSection))
  ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
    name: 'conversation.input.right', id: 'codex-subscription-quota', order: 15,
    locale: NS,
    inject: sessionId => ({
      preference,
      rpc: connection.rpc,
      t,
      directory: ctx.modelDirectories.directoryFor(sessionId).store,
    }),
  }, CodexComposerQuota))
  const sessions = ctx.get('sessions')
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model', priority: -10, locale: NS,
    inject: sessionId => {
      const directory = ctx.modelDirectories.directoryFor(sessionId)
      const available = sessions.subagentAddress(sessionId) === undefined
      return {
        available,
        directory: directory.store,
        load: () => { if (available) void directory.load() },
        select: selection => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
        preference,
      }
    },
  }, CodexModelSelect))
  const conversation = ctx.get('conversation')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'codex_image_generate', locale: NS,
    inject: sessionId => ({
      t,
      loadImage: attachment => conversation.resolveImage(sessionId, attachment),
    }),
  }, CodexImageToolRow))
}
