window.__ModuleLoader__.load({
	id: "dsh-codex-subscription",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/.pnpm/@heroicons+react@2.2.0_react@18.3.1/node_modules/@heroicons/react/16/solid/esm/BoltIcon.js
		function BoltIcon({ title, titleId, ...props }, svgRef) {
			return /*#__PURE__*/ react.createElement("svg", Object.assign({
				xmlns: "http://www.w3.org/2000/svg",
				viewBox: "0 0 16 16",
				fill: "currentColor",
				"aria-hidden": "true",
				"data-slot": "icon",
				ref: svgRef,
				"aria-labelledby": titleId
			}, props), title ? /*#__PURE__*/ react.createElement("title", { id: titleId }, title) : null, /*#__PURE__*/ react.createElement("path", {
				fillRule: "evenodd",
				d: "M9.58 1.077a.75.75 0 0 1 .405.82L9.165 6h4.085a.75.75 0 0 1 .567 1.241l-6.5 7.5a.75.75 0 0 1-1.302-.638L6.835 10H2.75a.75.75 0 0 1-.567-1.241l6.5-7.5a.75.75 0 0 1 .897-.182Z",
				clipRule: "evenodd"
			}));
		}
		const ForwardRef = /*#__PURE__*/ react.forwardRef(BoltIcon);
		//#endregion
		//#region src/settings-contract.js
		const SETTINGS_NAMESPACE = "codex-subscription";
		const QUICK_QUOTA_FIELD = "quickQuotaVisible";
		const SEARCH_PROVIDER_FIELD = "searchProvider";
		const SEARCH_PROVIDER_CODEX = "codex";
		const SPEED_MODE_FIELD = "speedMode";
		const SPEED_MODE_STANDARD = "standard";
		const SPEED_MODE_FAST = "fast";
		const DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD;
		const normalizeSearchProvider = (value) => ["dsh", "codex"].includes(value) ? value : "dsh";
		const normalizeSpeedMode = (value) => ["standard", "fast"].includes(value) ? value : DEFAULT_SPEED_MODE;
		const supportsCodexFastMode = (modelId) => typeof modelId === "string" && (/^gpt-5\.(?:5|6)(?:$|-)/u.test(modelId) || modelId === "gpt-5.4");
		//#endregion
		//#region src/sidebar-quota.js
		const isDisplayableWindow = (window) => Number.isFinite(window?.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100 && Number.isFinite(window?.windowSeconds) && window.windowSeconds > 0;
		const normalized = (value) => String(value ?? "").toLocaleLowerCase("en-US").replaceAll(/[^a-z0-9]+/gu, "-");
		const limitMatchesModel = (limit, model) => {
			if (/\bspark\b/u.test(normalized(model))) return /\bspark\b/u.test(normalized(`${limit?.id ?? ""} ${limit?.name ?? ""}`));
			return limit?.id === "codex";
		};
		function selectModelQuota(usage, model) {
			const windows = Array.isArray(usage?.rateLimits) ? usage.rateLimits.filter((limit) => limitMatchesModel(limit, model) && Array.isArray(limit.windows)).flatMap((limit) => limit.windows).filter(isDisplayableWindow) : [];
			if (windows.length === 0) return void 0;
			const selected = windows.reduce((lowest, candidate) => candidate.remainingPercent < lowest.remainingPercent ? candidate : lowest);
			return {
				remainingPercent: selected.remainingPercent,
				windowSeconds: selected.windowSeconds,
				...Number.isSafeInteger(selected.resetsAt) ? { resetsAt: selected.resetsAt } : {}
			};
		}
		//#endregion
		//#region src/login-progress.js
		/** Reconcile a login flow with the credential store without exposing credentials. */
		async function readLoginProgress({ flow, readFlow, readAccount }) {
			try {
				const nextFlow = await readFlow();
				if (nextFlow.phase !== "authenticated") return { flow: nextFlow };
				return {
					flow: nextFlow,
					account: await readAccount()
				};
			} catch (flowError) {
				try {
					const account = await readAccount();
					if (account?.authenticated === true) return {
						flow: {
							id: flow.id,
							method: flow.method,
							phase: "authenticated",
							authenticated: true
						},
						account,
						recovered: true
					};
				} catch {}
				throw flowError;
			}
		}
		//#endregion
		//#region src/client.jsx
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"settingsScope",
			"modelDirectories",
			"conversation",
			"sessions"
		];
		const NS = "settings.codexSubscription";
		const CHANNEL = "/codex-subscription";
		const QUICK_QUOTA_REFRESH_EVENT = "dsh-codex-subscription:refresh-quick-quota";
		const QUICK_QUOTA_REFRESH_MS = 6e4;
		const zh = {
			nav: "Codex 订阅",
			title: "Codex 订阅",
			connected: "已登录",
			disconnected: "未登录",
			accountLoading: "正在读取账户状态…",
			browserLogin: "浏览器登录",
			deviceLogin: "设备代码登录",
			logout: "退出登录",
			cancel: "取消",
			submit: "提交授权码",
			openLogin: "打开登录页",
			manualCode: "若浏览器回调没有自动完成，请粘贴授权码或完整重定向地址。",
			deviceHint: "在登录页输入此设备代码：",
			waiting: "正在等待登录完成…",
			failed: "登录失败，请重试。",
			loadFailed: "无法读取账户状态。",
			accountRetry: "重试",
			diagnostics: "支持诊断",
			diagnosticsHint: "生成不含凭据、账号标识和授权时间的诊断信息。",
			diagnosticsLoad: "生成诊断",
			diagnosticsCopy: "复制诊断",
			diagnosticsCopied: "已复制",
			diagnosticsFailed: "无法生成诊断信息。",
			searchTitle: "搜索来源",
			searchDsh: "DSH 默认",
			searchDshHint: "当前搜索服务",
			searchCodex: "Codex 订阅",
			searchCodexHint: "ChatGPT 订阅搜索",
			preferenceFailed: "设置未保存。",
			preferenceRetry: "重试",
			usage: "订阅额度",
			refresh: "刷新",
			refreshing: "刷新中…",
			noUsage: "登录后可读取 ChatGPT 返回的额度窗口。",
			usageLoading: "正在读取额度…",
			usageEmpty: "当前账户没有返回可显示的额度窗口。请稍后刷新；这不代表额度为零。",
			usageUpdated: "更新于 {value}",
			remaining: "剩余 {value}%",
			windowFiveHours: "5 小时额度",
			windowDaily: "每日额度",
			windowWeekly: "每周额度",
			windowMonthly: "每月额度",
			windowAnnual: "年度额度",
			windowHours: "{value} 小时额度",
			windowDays: "{value} 天额度",
			resets: "重置于 {value}",
			resetUnknown: "重置时间未提供",
			creditsBalance: "额外 Credits 余额",
			creditsUnit: "credits",
			unlimited: "不限额",
			monthlyCreditLimit: "Credits 月度消费上限",
			resetCredits: "可用额度重置次数",
			resetCreditsValue: "{count} 次",
			creditsNote: "仅显示 Codex 为此账户或工作区实际返回的额外 Credits、消费上限或额度重置次数；三者不是同一项。",
			creditsUsed: "已用 {used} / {limit} credits",
			spendReached: "Credits 月度消费上限已用尽。",
			unavailable: "暂无数据",
			quickQuotaSetting: "输入框额度",
			quickQuotaBeta: "Beta",
			quickQuotaStatus: "Codex 剩余额度 {value}%",
			speedTitle: "速度",
			speedStandard: "标准",
			speedStandardHint: "标准速度",
			speedFast: "高速",
			speedFastHint: "1.5 倍，消耗更多 Credits",
			modelMenuAria: "模型、推理等级与速度",
			modelLabel: "模型",
			effortLabel: "推理等级",
			providerDefault: "Default",
			selectModel: "选择模型",
			modelsLoading: "正在读取模型…",
			modelsEmpty: "没有可用模型。",
			effortsEmpty: "当前模型未提供推理等级。",
			modelRetry: "重试",
			modelFailed: "模型目录加载失败：{value}",
			groupFailed: "{name}：{value}",
			imageGenerate: "生成图片",
			imageGenerating: "正在生成…",
			imageGenerated: "已生成",
			imageFailed: "生成失败",
			imageLabel: "生成的图片",
			imageOpen: "查看原图",
			imageOpenNamed: "查看 {value}",
			imageLoading: "正在加载图片…",
			imageLoadFailed: "图片加载失败，点击重试",
			imagePreview: "图片预览",
			imageClosePreview: "关闭预览"
		};
		const en = {
			nav: "Codex",
			title: "Codex subscription",
			connected: "Signed in",
			disconnected: "Not signed in",
			accountLoading: "Reading account status…",
			browserLogin: "Browser sign-in",
			deviceLogin: "Device-code sign-in",
			logout: "Sign out",
			cancel: "Cancel",
			submit: "Submit authorization code",
			openLogin: "Open sign-in page",
			manualCode: "If the browser callback did not finish automatically, paste the code or full redirect URL.",
			deviceHint: "Enter this device code on the sign-in page:",
			waiting: "Waiting for sign-in to finish…",
			failed: "Sign-in failed. Try again.",
			loadFailed: "Could not read account status.",
			accountRetry: "Retry",
			diagnostics: "Support diagnostics",
			diagnosticsHint: "Create a report without credentials, account identifiers, or authorization timestamps.",
			diagnosticsLoad: "Create report",
			diagnosticsCopy: "Copy report",
			diagnosticsCopied: "Copied",
			diagnosticsFailed: "Could not create diagnostics.",
			searchTitle: "Search source",
			searchDsh: "DSH default",
			searchDshHint: "Current search service",
			searchCodex: "Codex subscription",
			searchCodexHint: "ChatGPT subscription search",
			preferenceFailed: "The setting was not saved.",
			preferenceRetry: "Retry",
			usage: "Subscription quota",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			noUsage: "Sign in to read quota windows reported by ChatGPT.",
			usageLoading: "Reading quota…",
			usageEmpty: "This account returned no displayable quota windows. Refresh later; this does not mean zero quota.",
			usageUpdated: "Updated {value}",
			remaining: "{value}% remaining",
			windowFiveHours: "5-hour quota",
			windowDaily: "Daily quota",
			windowWeekly: "Weekly quota",
			windowMonthly: "Monthly quota",
			windowAnnual: "Annual quota",
			windowHours: "{value}-hour quota",
			windowDays: "{value}-day quota",
			resets: "Resets {value}",
			resetUnknown: "Reset time not provided",
			creditsBalance: "Extra Credits balance",
			creditsUnit: "credits",
			unlimited: "Unlimited",
			monthlyCreditLimit: "Monthly Credits spending cap",
			resetCredits: "Available quota resets",
			resetCreditsValue: "{count} available",
			creditsNote: "Shows only extra Credits, spending caps, or quota resets returned for this account or workspace; these are separate items.",
			creditsUsed: "{used} / {limit} credits used",
			spendReached: "The monthly Credits spending cap has been reached.",
			unavailable: "No data yet",
			quickQuotaSetting: "Composer quota",
			quickQuotaBeta: "Beta",
			quickQuotaStatus: "Codex quota: {value}% remaining",
			speedTitle: "Speed",
			speedStandard: "Standard",
			speedStandardHint: "Standard speed",
			speedFast: "Fast",
			speedFastHint: "1.5x; higher Credits use",
			modelMenuAria: "Model, effort, and speed",
			modelLabel: "Model",
			effortLabel: "Effort",
			providerDefault: "Default",
			selectModel: "Select model",
			modelsLoading: "Loading models…",
			modelsEmpty: "No models available.",
			effortsEmpty: "This model provides no reasoning effort levels.",
			modelRetry: "Retry",
			modelFailed: "Could not load models: {value}",
			groupFailed: "{name}: {value}",
			imageGenerate: "Generate image",
			imageGenerating: "Generating…",
			imageGenerated: "Generated",
			imageFailed: "Generation failed",
			imageLabel: "Generated image",
			imageOpen: "View original",
			imageOpenNamed: "View {value}",
			imageLoading: "Loading image…",
			imageLoadFailed: "Image failed to load. Click to retry",
			imagePreview: "Image preview",
			imageClosePreview: "Close preview"
		};
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
.codexSubscriptionSpendLimit{display:flex;flex-direction:column;gap:8px}.codexSubscriptionSpendTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexSubscriptionSpendTop strong{font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.codexSubscriptionSpendLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}.codexSubscriptionSpendLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexSubscriptionSpendLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionSpendLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexComposerQuota{display:inline-flex;align-items:center;flex:0 0 auto;height:28px;box-sizing:border-box;padding:0;color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:12px;line-height:20px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}
.codexModelSelect{position:relative;min-width:0}.codexModelSelectTrigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:0;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;font-weight:500;line-height:20px;cursor:pointer}.codexModelSelectTrigger:hover:not(:disabled),.codexModelSelectTrigger[aria-expanded=true]{background:var(--dsw-alias-interactive-bg-hover)}.codexModelSelectTrigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}.codexModelSelectTrigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectBolt{display:block;flex:none;width:14px;height:14px;color:var(--dsw-alias-label-primary)}.codexModelSelectLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectEffort{flex:none;color:var(--dsw-alias-label-caption)}.codexModelSelectChevron{flex:none;color:var(--dsw-alias-label-caption);transition:transform 120ms}.codexModelSelectTrigger[aria-expanded=true] .codexModelSelectChevron{transform:rotate(180deg)}
.codexModelSelectMenu,.codexModelSelectSubmenu{position:absolute;z-index:30;box-sizing:border-box;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);overflow:hidden}.codexModelSelectMenu{right:0;bottom:calc(100% + 8px)}.codexModelSelectSubmenu{right:calc(100% + 8px);bottom:0;min-width:min(230px,calc(100vw - 32px))}.codexModelSelectCell{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;height:40px;box-sizing:border-box;padding:0 10px;border:0;border-radius:10px;background:transparent;color:inherit;font-size:14px;line-height:22px;text-align:left;cursor:pointer}.codexModelSelectCell:hover,.codexModelSelectCell:focus-visible,.codexModelSelectCell[data-open=true]{background:var(--dsw-alias-interactive-bg-hover);outline:0}.codexModelSelectCell:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectCellLabel{flex:none;white-space:nowrap}.codexModelSelectCellValue{flex:auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectCellChevron{flex:none;color:var(--dsw-alias-label-tertiary)}.codexModelSelectGroups{min-height:0;max-height:352px;overflow-y:auto}.codexModelSelectGroup+.codexModelSelectGroup{margin-top:4px}.codexModelSelectGroupTitle{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:500;line-height:18px}.codexModelSelectOption{display:flex;align-items:center;gap:8px;width:100%;min-width:100%;min-height:38px;box-sizing:border-box;padding:6px 8px;border:0;border-radius:10px;outline:0;background:transparent;color:inherit;text-align:left;cursor:pointer}.codexModelSelectOption:hover:not(:disabled),.codexModelSelectOption:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}.codexModelSelectOption:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}.codexModelSelectOptionCopy{display:flex;flex:1;min-width:0;flex-direction:column}.codexModelSelectOptionName{overflow:hidden;color:inherit;font-size:14px;font-weight:500;line-height:20px;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectOptionDescription{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}.codexModelSelectCheck{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}.codexModelSelectStatus,.codexModelSelectEmpty{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.codexModelSelectError,.codexModelSelectWarning{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.codexModelSelectWarning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}.codexModelSelectRetry{flex:none;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.codexModelSelectMenu{overflow:visible}
.codexImageTool{display:flex;flex-direction:column;gap:8px;margin:4px 0;color:var(--dsw-alias-label-primary)}.codexImageToolRow{display:flex;align-items:center;min-height:24px;gap:8px;font-size:13px;line-height:20px}.codexImageToolIcon{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary)}.codexImageToolIcon::before{content:'';width:8px;height:8px;border:1.5px solid currentColor;border-radius:3px}.codexImageTool[data-state=running] .codexImageToolIcon::before{border-radius:50%;border-right-color:transparent;animation:codexImageSpin 800ms linear infinite}.codexImageTool[data-state=error] .codexImageToolIcon::before{border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-state-error-primary)}.codexImageToolTitle{font-weight:500}.codexImageToolState{color:var(--dsw-alias-label-tertiary)}.codexImageToolError{margin:0 0 0 24px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}.codexImageToolGallery{margin-left:24px}.codexGeneratedImageFrame{display:flex;align-items:center;justify-content:center;width:min(240px,100%);min-height:120px;padding:0;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);cursor:pointer}.codexGeneratedImageFrame img{display:block;width:100%;max-height:240px;object-fit:contain}.codexGeneratedImageRetry{min-height:36px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);cursor:pointer}.codexGeneratedImageLightbox{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:32px;border:0;background:rgba(0,0,0,.72)}.codexGeneratedImageLightbox img{display:block;max-width:min(1100px,calc(100vw - 64px));max-height:calc(100vh - 64px);object-fit:contain}.codexGeneratedImageClose{position:absolute;top:16px;right:16px;width:36px;height:36px;border:1px solid rgba(255,255,255,.35);border-radius:50%;background:rgba(0,0,0,.48);color:#fff;font-size:20px;line-height:1;cursor:pointer}@keyframes codexImageSpin{to{transform:rotate(360deg)}}
@container (max-width:560px){.codexSubscriptionCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{align-items:flex-start;flex-direction:column}.codexSubscriptionActions{width:100%}.codexSubscriptionSearchChoices{grid-template-columns:1fr}}
@media(max-width:640px){.codexSubscriptionCard{padding:14px}}
`;
		const unwrap = (response) => {
			if (!response?.ok) throw new Error(response?.error?.message ?? "Codex RPC failed");
			return response.value;
		};
		const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text);
		const hours = (seconds) => Math.round(seconds / 3600 * 10) / 10;
		const percent = (value) => Number(value).toLocaleString(void 0, { maximumFractionDigits: 1 });
		const isApproximateWindow = (seconds, expected) => seconds >= expected * .95 && seconds <= expected * 1.05;
		const windowLabel = (seconds, t) => {
			if (isApproximateWindow(seconds, 18e3)) return t("windowFiveHours");
			if (isApproximateWindow(seconds, 86400)) return t("windowDaily");
			if (isApproximateWindow(seconds, 604800)) return t("windowWeekly");
			if (isApproximateWindow(seconds, 2592e3)) return t("windowMonthly");
			if (isApproximateWindow(seconds, 31536e3)) return t("windowAnnual");
			return seconds >= 86400 && seconds % 86400 === 0 ? fill(t("windowDays"), { value: seconds / 86400 }) : fill(t("windowHours"), { value: hours(seconds) });
		};
		const validDate = (value) => {
			const date = new Date(value);
			return Number.isFinite(date.getTime()) ? date : void 0;
		};
		function CodexGeneratedImage({ attachment, loadImage, t }) {
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [error, setError] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const [src, setSrc] = (0, react.useState)();
			const closeRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				let live = true;
				setError(false);
				setSrc(void 0);
				loadImage(attachment).then((value) => {
					if (live) setSrc(value);
				}).catch(() => {
					if (live) setError(true);
				});
				return () => {
					live = false;
				};
			}, [
				attachment,
				loadImage,
				attempt
			]);
			(0, react.useEffect)(() => {
				if (!open) return void 0;
				const handleKeyDown = (event) => {
					if (event.key === "Escape") {
						event.preventDefault();
						setOpen(false);
					} else if (event.key === "Tab") {
						event.preventDefault();
						closeRef.current?.focus();
					}
				};
				document.addEventListener("keydown", handleKeyDown);
				closeRef.current?.focus();
				return () => {
					document.removeEventListener("keydown", handleKeyDown);
					triggerRef.current?.focus();
				};
			}, [open]);
			const label = attachment.name ?? t("imageLabel");
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "codexGeneratedImageRetry",
				onClick: () => setAttempt((value) => value + 1),
				children: t("imageLoadFailed")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				ref: triggerRef,
				type: "button",
				className: "codexGeneratedImageFrame",
				title: t("imageOpen"),
				"aria-label": fill(t("imageOpenNamed"), { value: label }),
				onClick: () => {
					if (src !== void 0) setOpen(true);
				},
				children: src === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageLoading") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: label
				})
			}), !open || src === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexGeneratedImageLightbox",
				role: "dialog",
				"aria-modal": "true",
				"aria-label": t("imagePreview"),
				onClick: () => setOpen(false),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: label,
					onClick: (event) => event.stopPropagation()
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					ref: closeRef,
					type: "button",
					className: "codexGeneratedImageClose",
					"aria-label": t("imageClosePreview"),
					onClick: () => setOpen(false),
					children: "×"
				})]
			})] });
		}
		function CodexImageToolRow({ block, loadImage, t }) {
			const settled = block?.kind === "tool-result";
			const image = settled ? block.content.find((item) => item?.type === "image" && item.attachment !== void 0) : void 0;
			const failed = settled && block.isError === true;
			const state = !settled ? "running" : failed ? "error" : "done";
			const status = !settled ? t("imageGenerating") : failed ? t("imageFailed") : t("imageGenerated");
			const error = failed ? block.content.find((item) => item?.type === "text" && typeof item.text === "string")?.text : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexImageTool",
				"data-state": state,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexImageToolRow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolIcon",
								"aria-hidden": "true"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolTitle",
								children: t("imageGenerate")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexImageToolState",
								children: status
							})
						]
					}),
					image === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexImageToolGallery",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexGeneratedImage, {
							attachment: image.attachment,
							loadImage,
							t
						})
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexImageToolError",
						children: error
					})
				]
			});
		}
		function createPreferenceController(scope, rpc) {
			let updating = false;
			let error = false;
			let fallbackStatus = "loading";
			let fallback;
			let failedPatch;
			let generation = 0;
			const nativeSnapshot = () => scope.getSnapshot();
			const read = () => {
				const native = nativeSnapshot();
				const current = native.status === "ready" ? native : fallbackStatus === "ready" ? fallback : native;
				return Object.freeze({
					status: updating ? "updating" : current.status,
					visible: current.value?.[QUICK_QUOTA_FIELD] === true,
					searchProvider: normalizeSearchProvider(current.value?.[SEARCH_PROVIDER_FIELD]),
					speedMode: normalizeSpeedMode(current.value?.[SPEED_MODE_FIELD]),
					writable: !updating && current.status === "ready" && current.writable === true,
					error
				});
			};
			let snapshot = read();
			const listeners = /* @__PURE__ */ new Set();
			const publish = () => {
				snapshot = read();
				for (const listener of listeners) listener();
			};
			const disposeScope = scope.subscribe(() => {
				error = false;
				failedPatch = void 0;
				publish();
			});
			const acceptFallback = (value) => {
				fallbackStatus = "ready";
				fallback = {
					status: "ready",
					value: {
						[QUICK_QUOTA_FIELD]: value?.[QUICK_QUOTA_FIELD] === true,
						[SEARCH_PROVIDER_FIELD]: normalizeSearchProvider(value?.[SEARCH_PROVIDER_FIELD]),
						[SPEED_MODE_FIELD]: normalizeSpeedMode(value?.[SPEED_MODE_FIELD])
					},
					writable: value?.writable === true
				};
			};
			const load = async () => {
				const current = ++generation;
				updating = false;
				fallbackStatus = "loading";
				fallback = void 0;
				error = false;
				publish();
				if (nativeSnapshot().status === "ready") return;
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/status", {}));
					if (current !== generation || nativeSnapshot().status === "ready") return;
					acceptFallback(value);
					publish();
				} catch {
					if (current !== generation || nativeSnapshot().status === "ready") return;
					fallbackStatus = "unavailable";
					publish();
				}
			};
			const set = async (patch) => {
				if (snapshot.status !== "ready" || snapshot.writable !== true) return;
				const current = ++generation;
				const entries = Object.entries(patch);
				updating = true;
				error = false;
				failedPatch = void 0;
				publish();
				try {
					if (nativeSnapshot().status === "ready") {
						for (const [field, value] of entries) {
							if (current !== generation) return;
							await scope.set(field, value);
						}
						if (current !== generation) return;
						const accepted = nativeSnapshot().value;
						error = entries.some(([field, value]) => accepted?.[field] !== value);
					} else {
						const value = unwrap(await rpc.call(CHANNEL, "preferences/update", patch));
						if (current !== generation) return;
						acceptFallback(value);
					}
				} catch {
					if (current === generation) {
						error = true;
						failedPatch = patch;
					}
				} finally {
					if (current === generation) {
						updating = false;
						publish();
					}
				}
			};
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				load,
				set,
				retry: () => failedPatch === void 0 ? load() : set(failedPatch),
				dispose: disposeScope
			};
		}
		const usePreferenceSnapshot = (preference) => (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
		const notifyQuickQuota = () => window.dispatchEvent(new Event(QUICK_QUOTA_REFRESH_EVENT));
		function useQuickQuota(rpc, enabled, model) {
			const [quota, setQuota] = (0, react.useState)();
			(0, react.useEffect)(() => {
				if (!enabled) {
					setQuota(void 0);
					return;
				}
				let live = true;
				let loading = false;
				const load = async () => {
					if (loading) return;
					loading = true;
					try {
						const account = unwrap(await rpc.call(CHANNEL, "status", {}));
						if (!live) return;
						if (account?.authenticated !== true) {
							setQuota(void 0);
							return;
						}
						const usage = unwrap(await rpc.call(CHANNEL, "usage", { force: false }));
						if (live) setQuota(selectModelQuota(usage, model));
					} catch {
						if (live) setQuota(void 0);
					} finally {
						loading = false;
					}
				};
				const refresh = () => {
					load();
				};
				load();
				const timer = window.setInterval(refresh, QUICK_QUOTA_REFRESH_MS);
				window.addEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh);
				return () => {
					live = false;
					window.clearInterval(timer);
					window.removeEventListener(QUICK_QUOTA_REFRESH_EVENT, refresh);
				};
			}, [
				rpc,
				enabled,
				model
			]);
			return quota;
		}
		function QuickQuotaPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const visible = snapshot.visible;
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexSubscriptionPreferenceCopy",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "codexSubscriptionPreferenceLabel",
						children: [t("quickQuotaSetting"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionTag",
							children: t("quickQuotaBeta")
						})]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "codexSubscriptionSwitch",
					type: "button",
					role: "switch",
					"aria-checked": visible,
					"aria-label": t("quickQuotaSetting"),
					disabled: !writable,
					onClick: () => {
						preference.set({ [QUICK_QUOTA_FIELD]: !visible });
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionSwitchKnob",
						"aria-hidden": "true"
					})
				})]
			});
		}
		function SearchProviderPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			const choice = (value, label, hint) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: "codexSubscriptionSearchChoice",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: "codexSubscriptionSearchInput",
					type: "radio",
					name: "codex-subscription-search-provider",
					checked: snapshot.searchProvider === value,
					disabled: !writable,
					onChange: () => {
						preference.set({ [SEARCH_PROVIDER_FIELD]: value });
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexSubscriptionSearchCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: hint })]
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionSearch",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("searchTitle") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexSubscriptionSearchChoices",
					role: "radiogroup",
					"aria-label": t("searchTitle"),
					children: [choice("dsh", t("searchDsh"), t("searchDshHint")), choice(SEARCH_PROVIDER_CODEX, t("searchCodex"), t("searchCodexHint"))]
				})]
			});
		}
		function PreferencesCard({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionPreferencesCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SearchProviderPreference, {
						preference,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "codexSubscriptionDivider" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuickQuotaPreference, {
						preference,
						t
					}),
					snapshot.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionRecover",
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSubscriptionError",
							children: t("preferenceFailed")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							onClick: () => {
								preference.retry();
							},
							children: t("preferenceRetry")
						})]
					}) : null
				]
			});
		}
		function CodexComposerQuota({ preference, rpc, t, directory }) {
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const current = (0, react.useSyncExternalStore)((listener) => directory.subscribe(listener), () => directory.getSnapshot()).current;
			const codex = current?.provider === "openai-codex";
			const quotaEnabled = preferenceSnapshot.status === "ready" && preferenceSnapshot.visible && codex;
			const quota = useQuickQuota(rpc, quotaEnabled, current?.model);
			if (!quotaEnabled || quota === void 0) return null;
			const value = percent(quota.remainingPercent);
			const label = fill(t("quickQuotaStatus"), { value });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "codexComposerQuota",
				role: "status",
				"aria-label": label,
				title: label,
				children: [value, "%"]
			});
		}
		function CodexModelSelect({ locked, available, directory, load, select, preference, t }) {
			const state = (0, react.useSyncExternalStore)(directory.subscribe, directory.getSnapshot);
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const id = (0, react.useId)();
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				selection: {
					provider: group.id,
					model: model.id,
					...model.reasoning?.defaultEffort === void 0 ? {} : { reasoningEffort: model.reasoning.defaultEffort }
				}
			}))), [state.groups]);
			const currentChoice = choices.find((choice) => choice.selection.provider === state.current?.provider && choice.selection.model === state.current?.model);
			const reasoning = currentChoice?.model.reasoning;
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))], [reasoning, t]);
			const modelLabel = currentChoice?.model.name ?? t("selectModel");
			const speedSupported = state.current?.provider === "openai-codex" && supportsCodexFastMode(state.current?.model);
			const speedWritable = preferenceSnapshot.status === "ready" && preferenceSnapshot.writable === true;
			const fast = speedSupported && preferenceSnapshot.speedMode === "fast";
			const busy = state.status === "selecting";
			(0, react.useEffect)(() => {
				if (available) load();
			}, [available, load]);
			(0, react.useEffect)(() => {
				if (!open) return void 0;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) {
						setOpen(false);
						setPane("root");
					}
				};
				document.addEventListener("mousedown", closeOutside);
				return () => document.removeEventListener("mousedown", closeOutside);
			}, [open]);
			(0, react.useEffect)(() => {
				if (!speedSupported && pane === "speed") setPane("root");
			}, [pane, speedSupported]);
			if (!available) return null;
			const close = (restoreFocus = false) => {
				setOpen(false);
				setPane("root");
				if (restoreFocus) queueMicrotask(() => triggerRef.current?.focus());
			};
			const settleSelection = (accepted) => {
				if (accepted) close(true);
			};
			const chooseModel = (selection) => {
				if (state.current?.provider === selection.provider && state.current.model === selection.model) {
					close(true);
					return;
				}
				select(selection).then(settleSelection);
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				if (effectiveEffort === effort) {
					close(true);
					return;
				}
				select({
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				}).then(settleSelection);
			};
			const chooseSpeed = (speedMode) => {
				close(true);
				preference.set({ [SPEED_MODE_FIELD]: speedMode });
			};
			const option = ({ key, label, description, selected, disabled, onClick }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "menuitemradio",
				"aria-checked": selected,
				className: "codexModelSelectOption",
				disabled,
				onClick,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexModelSelectOptionCopy",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectOptionName",
						children: label
					}), description === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectOptionDescription",
						children: description
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "codexModelSelectCheck",
					children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : null
				})]
			}, key);
			const cell = (target, label, value) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				role: "menuitem",
				className: "codexModelSelectCell",
				"data-open": pane === target,
				"aria-haspopup": "menu",
				"aria-expanded": pane === target,
				onClick: () => setPane((current) => current === target ? "root" : target),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectCellLabel",
						children: label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexModelSelectCellValue",
						children: value
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { className: "codexModelSelectCellChevron" })
				]
			});
			let submenu = null;
			if (pane === "model") submenu = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexModelSelectSubmenu",
				role: "menu",
				"aria-label": t("modelLabel"),
				children: [
					state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectStatus",
						children: t("modelsLoading")
					}) : null,
					state.error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexModelSelectError",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("modelFailed"), { value: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: "codexModelSelectRetry",
							type: "button",
							onClick: load,
							children: t("modelRetry")
						})]
					}),
					state.failures.map((failure) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectWarning",
						children: fill(t("groupFailed"), {
							name: failure.name,
							value: failure.message
						})
					}, failure.id)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectGroups scrollable",
						children: state.groups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: "codexModelSelectGroup",
							role: "group",
							"aria-labelledby": `${id}-${group.id}`,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexModelSelectGroupTitle",
								id: `${id}-${group.id}`,
								children: group.name
							}), group.models.map((model) => option({
								key: model.id,
								label: model.name,
								description: model.description,
								selected: state.current?.provider === group.id && state.current.model === model.id,
								disabled: busy,
								onClick: () => chooseModel({
									provider: group.id,
									model: model.id
								})
							}))]
						}, group.id))
					}),
					state.status === "ready" && choices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexModelSelectEmpty",
						children: t("modelsEmpty")
					}) : null
				]
			});
			else if (pane === "effort") submenu = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "codexModelSelectSubmenu",
				role: "menu",
				"aria-label": t("effortLabel"),
				children: effortChoices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "codexModelSelectEmpty",
					children: t("effortsEmpty")
				}) : effortChoices.map((level) => option({
					key: level.key,
					label: level.label,
					description: level.description,
					selected: effectiveEffort === level.effort,
					disabled: busy,
					onClick: () => chooseEffort(level.effort)
				}))
			});
			else if (pane === "speed") submenu = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexModelSelectSubmenu",
				role: "menu",
				"aria-label": t("speedTitle"),
				children: [option({
					key: SPEED_MODE_STANDARD,
					label: t("speedStandard"),
					description: t("speedStandardHint"),
					selected: !fast,
					disabled: !speedWritable,
					onClick: () => chooseSpeed(SPEED_MODE_STANDARD)
				}), option({
					key: SPEED_MODE_FAST,
					label: t("speedFast"),
					description: t("speedFastHint"),
					selected: fast,
					disabled: !speedWritable,
					onClick: () => chooseSpeed(SPEED_MODE_FAST)
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexModelSelect",
				ref: rootRef,
				onKeyDown: (event) => {
					if (event.key !== "Escape" || !open) return;
					event.preventDefault();
					if (pane === "root") close(true);
					else setPane("root");
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: "codexModelSelectTrigger",
					"aria-label": modelLabel,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					"aria-controls": open ? `${id}-menu` : void 0,
					title: modelLabel,
					disabled: locked,
					onClick: () => open ? close() : (setPane("root"), setOpen(true), load()),
					children: [
						fast && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ForwardRef, {
							className: "codexModelSelectBolt",
							"aria-hidden": "true"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexModelSelectLabel",
							children: modelLabel
						}),
						effortLabel === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexModelSelectEffort",
							children: effortLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: "codexModelSelectChevron" })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "codexModelSelectMenu",
					id: `${id}-menu`,
					role: "menu",
					"aria-label": t("modelMenuAria"),
					"aria-busy": state.status === "loading" || busy,
					children: [
						cell("model", t("modelLabel"), modelLabel),
						reasoning === void 0 ? null : cell("effort", t("effortLabel"), effortLabel),
						speedSupported && cell("speed", t("speedTitle"), t(fast ? "speedFast" : "speedStandard")),
						submenu
					]
				}) : null]
			});
		}
		function AccountCard({ rpc, t, account, setAccount, onSignedOut }) {
			const [flow, setFlow] = (0, react.useState)();
			const [manualCode, setManualCode] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const call = (endpoint, payload = {}) => rpc.call(CHANNEL, endpoint, payload).then(unwrap);
			(0, react.useEffect)(() => {
				if (flow?.id === void 0 || [
					"authenticated",
					"failed",
					"cancelled"
				].includes(flow.phase)) return void 0;
				const timer = window.setInterval(() => {
					readLoginProgress({
						flow,
						readFlow: () => call("login/status", { id: flow.id }),
						readAccount: () => call("status")
					}).then((next) => {
						setFlow(next.flow);
						setError(void 0);
						if (next.account !== void 0) {
							setAccount(next.account);
							notifyQuickQuota();
						}
					}).catch(() => setError(t("failed")));
				}, 800);
				return () => window.clearInterval(timer);
			}, [flow?.id, flow?.phase]);
			const begin = (method) => {
				setBusy(true);
				setError(void 0);
				call("login/start", {
					method,
					openExternal: true
				}).then(setFlow).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const cancel = () => {
				if (flow?.id === void 0) return;
				setBusy(true);
				call("login/cancel", { id: flow.id }).then((next) => {
					setFlow(next);
					return call("status").then((account) => {
						if (account.authenticated === true) {
							setAccount(account);
							setFlow({
								...next,
								phase: "authenticated",
								authenticated: true
							});
							setError(void 0);
							notifyQuickQuota();
						}
					});
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const submit = (event) => {
				event.preventDefault();
				if (flow?.id === void 0 || manualCode.trim() === "") return;
				setBusy(true);
				call("login/submit", {
					id: flow.id,
					value: manualCode.trim()
				}).then((next) => {
					setManualCode("");
					setFlow(next);
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const logout = () => {
				setBusy(true);
				setError(void 0);
				call("logout").then((next) => {
					setAccount(next);
					setFlow(void 0);
					onSignedOut();
					notifyQuickQuota();
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const signedIn = account?.authenticated === true;
			const accountReady = account !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionAccountRow",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionStatus",
							role: "status",
							"aria-live": "polite",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "codexSubscriptionDot",
								"data-state": accountReady ? signedIn ? "connected" : "disconnected" : "loading",
								"aria-hidden": "true"
							}), accountReady ? signedIn ? t("connected") : t("disconnected") : t("accountLoading")]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "codexSubscriptionActions",
							children: signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: logout,
								children: t("logout")
							}) : accountReady && (flow === void 0 || ["failed", "cancelled"].includes(flow.phase)) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "primary",
								disabled: busy,
								onClick: () => begin("browser"),
								children: t("browserLogin")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: () => begin("device_code"),
								children: t("deviceLogin")
							})] }) : null
						})]
					}),
					!signedIn && flow?.phase === "waiting_device" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionFlow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("deviceHint") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: "codexSubscriptionCode",
								children: flow.deviceCode?.userCode
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: flow.deviceCode?.verificationUri,
								target: "_blank",
								rel: "noreferrer",
								children: t("openLogin")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("waiting") })
						]
					}) : null,
					!signedIn && flow?.phase === "waiting_input" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
						className: "codexSubscriptionFlow",
						onSubmit: submit,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("manualCode") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: "codexSubscriptionInput",
								value: manualCode,
								onChange: (event) => setManualCode(event.currentTarget.value),
								autoComplete: "off",
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "codexSubscriptionActions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "submit",
									variant: "primary",
									disabled: busy || manualCode.trim() === "",
									children: t("submit")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
									type: "button",
									variant: "outline",
									disabled: busy,
									onClick: cancel,
									children: t("cancel")
								})]
							})
						]
					}) : null,
					!signedIn && flow !== void 0 && ["starting", "waiting_browser"].includes(flow.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionFlow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("waiting") }),
							flow.authUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: flow.authUrl,
								target: "_blank",
								rel: "noreferrer",
								children: t("openLogin")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: cancel,
								children: t("cancel")
							})
						]
					}) : null,
					flow?.phase === "failed" || error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: error ?? t("failed")
					}) : null
				]
			});
		}
		function AccountFailureCard({ retry, t }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionRecover",
				role: "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "codexSubscriptionError",
					children: t("loadFailed")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					type: "button",
					variant: "outline",
					onClick: retry,
					children: t("accountRetry")
				})]
			});
		}
		function DiagnosticsCard({ rpc, t }) {
			const [report, setReport] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [copied, setCopied] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(false);
			const load = () => {
				setBusy(true);
				setError(false);
				setCopied(false);
				rpc.call(CHANNEL, "diagnostics", {}).then(unwrap).then(setReport).catch(() => setError(true)).finally(() => setBusy(false));
			};
			const copy = () => {
				if (report === void 0) return;
				navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => setCopied(true)).catch(() => setError(true));
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionDiagnostics",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionSectionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionSectionTitle",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("diagnostics") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionNote",
								children: t("diagnosticsHint")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionActions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								disabled: busy,
								onClick: load,
								children: t("diagnosticsLoad")
							}), report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
								type: "button",
								variant: "outline",
								onClick: copy,
								children: copied ? t("diagnosticsCopied") : t("diagnosticsCopy")
							})]
						})]
					}),
					report === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: JSON.stringify(report, null, 2) }),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: t("diagnosticsFailed")
					}) : null
				]
			});
		}
		function ResetTime({ resetsAt, t }) {
			const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1e3) : void 0;
			if (date === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetUnknown") });
			const value = date.toLocaleString(void 0, {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
				dateTime: date.toISOString(),
				title: date.toLocaleString(),
				children: fill(t("resets"), { value })
			});
		}
		function UsageCard({ rpc, t, signedIn, resetKey }) {
			const [usage, setUsage] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const request = (0, react.useRef)(0);
			const load = (force) => {
				if (!signedIn) return;
				const id = ++request.current;
				setBusy(true);
				setError(void 0);
				rpc.call(CHANNEL, "usage", { force }).then(unwrap).then((next) => {
					if (request.current === id) {
						setUsage(next);
						if (force) notifyQuickQuota();
					}
				}).catch((error) => {
					if (request.current === id) setError(error.message);
				}).finally(() => {
					if (request.current === id) setBusy(false);
				});
			};
			(0, react.useEffect)(() => {
				if (signedIn) load(false);
				else {
					request.current += 1;
					setUsage(void 0);
					setError(void 0);
					setBusy(false);
				}
				return () => {
					request.current += 1;
				};
			}, [signedIn, resetKey]);
			const visibleUsage = signedIn ? usage : void 0;
			const limits = visibleUsage?.rateLimits ?? [];
			const hasUsageDetails = limits.length > 0 || visibleUsage?.credits !== void 0 || visibleUsage?.individualLimit !== void 0 || visibleUsage?.resetCredits?.availableCount > 0;
			const fetchedAt = typeof visibleUsage?.fetchedAt === "number" ? validDate(visibleUsage.fetchedAt) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionUsageCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionSectionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionSectionTitle",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }), fetchedAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
								className: "codexSubscriptionFreshness",
								dateTime: fetchedAt.toISOString(),
								children: fill(t("usageUpdated"), { value: fetchedAt.toLocaleString() })
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: "codexSubscriptionRefresh",
							type: "button",
							variant: "outline",
							disabled: !signedIn || busy,
							"aria-busy": busy,
							onClick: () => load(true),
							children: busy ? t("refreshing") : t("refresh")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"aria-live": "polite",
						children: [
							!signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								children: t("noUsage")
							}) : null,
							signedIn && busy && usage === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								role: "status",
								children: t("usageLoading")
							}) : null,
							signedIn && !busy && error === void 0 && usage !== void 0 && !hasUsageDetails ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "codexSubscriptionEmpty",
								role: "status",
								children: t("usageEmpty")
							}) : null
						]
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: error
					}),
					visibleUsage?.spendControlReached === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
						role: "alert",
						children: t("spendReached")
					}) : null,
					limits.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionLimits",
						children: limits.flatMap((limit) => limit.windows.map((window, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionLimit",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLimitTop",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "codexSubscriptionLimitLabel",
										children: limit.name ?? limit.id
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [percent(window.remainingPercent), "%"] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
									max: "100",
									value: window.remainingPercent,
									"aria-label": `${limit.name ?? limit.id} ${fill(t("remaining"), { value: percent(window.remainingPercent) })}`
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLimitMeta",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: windowLabel(window.windowSeconds, t) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
										resetsAt: window.resetsAt,
										t
									})]
								})
							]
						}, `${limit.id}-${window.windowSeconds}-${index}`)))
					}),
					visibleUsage?.credits === void 0 && visibleUsage?.individualLimit === void 0 && !(visibleUsage?.resetCredits?.availableCount > 0) ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionCreditSection",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "codexSubscriptionCreditNote",
							children: t("creditsNote")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionCreditRows",
							children: [
								visibleUsage?.credits ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionCreditBalance",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("creditsBalance") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: visibleUsage.credits.unlimited ? t("unlimited") : `${visibleUsage.credits.balance ?? t("unavailable")} ${t("creditsUnit")}` })]
								}) : null,
								visibleUsage?.resetCredits?.availableCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionCreditBalance",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetCredits") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: fill(t("resetCreditsValue"), { count: visibleUsage.resetCredits.availableCount }) })]
								}) : null,
								visibleUsage?.individualLimit ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionSpendLimit",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionSpendTop",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "codexSubscriptionCreditLabel",
												children: t("monthlyCreditLimit")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: fill(t("remaining"), { value: percent(visibleUsage.individualLimit.remainingPercent) }) })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
											max: "100",
											value: visibleUsage.individualLimit.remainingPercent,
											"aria-label": `${t("monthlyCreditLimit")} ${fill(t("remaining"), { value: percent(visibleUsage.individualLimit.remainingPercent) })}`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionLimitMeta",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("creditsUsed"), {
												used: visibleUsage.individualLimit.used,
												limit: visibleUsage.individualLimit.limit
											}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
												resetsAt: visibleUsage.individualLimit.resetsAt,
												t
											})]
										})
									]
								}) : null
							]
						})]
					})
				]
			});
		}
		function CodexSection({ preference, rpc, t }) {
			const [account, setAccount] = (0, react.useState)();
			const [accountError, setAccountError] = (0, react.useState)();
			const [resetKey, setResetKey] = (0, react.useState)(0);
			const accountRequest = (0, react.useRef)(0);
			const loadAccount = () => {
				const id = ++accountRequest.current;
				setAccount(void 0);
				setAccountError(void 0);
				rpc.call(CHANNEL, "status", {}).then(unwrap).then((next) => {
					if (accountRequest.current === id) setAccount(next);
				}).catch(() => {
					if (accountRequest.current === id) setAccountError(true);
				});
			};
			(0, react.useEffect)(() => {
				loadAccount();
				return () => {
					accountRequest.current += 1;
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "codexSubscription",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "codexSubscriptionHead",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") })
					}),
					accountError === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
						rpc,
						t,
						account,
						setAccount,
						onSignedOut: () => setResetKey((value) => value + 1)
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFailureCard, {
						retry: loadAccount,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreferencesCard, {
						preference,
						t
					}),
					account === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageCard, {
						rpc,
						t,
						signedIn: account.authenticated === true,
						resetKey
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiagnosticsCard, {
						rpc,
						t
					})
				]
			});
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "codex-subscription: copy");
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-codex-subscription";
				tag.textContent = STYLE;
				document.head.append(tag);
				return () => tag.remove();
			}, "codex-subscription: style");
			const connection = ctx.get("connection");
			const preference = createPreferenceController(ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }), connection.rpc);
			ctx.effect(() => {
				preference.load();
				const disposeReset = ctx.on("connection/reset", () => {
					preference.load();
				});
				return () => {
					disposeReset?.();
					preference.dispose();
				};
			}, "codex-subscription: preferences");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "codex-subscription",
				order: 15,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					preference,
					rpc: connection.rpc,
					t
				})
			}, CodexSection));
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "codex-subscription-quota",
				order: 15,
				locale: NS,
				inject: (sessionId) => ({
					preference,
					rpc: connection.rpc,
					t,
					directory: ctx.modelDirectories.directoryFor(sessionId).store
				})
			}, CodexComposerQuota));
			const sessions = ctx.get("sessions");
			ctx.slots.inject("conversation.input.model", () => ctx.slots.register({
				name: "conversation.input.model",
				priority: -10,
				locale: NS,
				inject: (sessionId) => {
					const directory = ctx.modelDirectories.directoryFor(sessionId);
					const available = sessions.subagentAddress(sessionId) === void 0;
					return {
						available,
						directory: directory.store,
						load: () => {
							if (available) directory.load();
						},
						select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
						preference
					};
				}
			}, CodexModelSelect));
			const conversation = ctx.get("conversation");
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "codex_image_generate",
				locale: NS,
				inject: (sessionId) => ({
					t,
					loadImage: (attachment) => conversation.resolveImage(sessionId, attachment)
				})
			}, CodexImageToolRow));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map