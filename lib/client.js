window.__ModuleLoader__.load({
	id: "@wsl043/dsh-codex-subscription",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client.jsx
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		const NS = "settings.wsl043CodexSubscription";
		const CHANNEL = "/wsl043-codex-subscription";
		const zh = {
			nav: "Codex 订阅",
			title: "ChatGPT / Codex 订阅",
			intro: "在 DSH 原生模型路由中使用你的 ChatGPT 订阅，并直接查看 Codex 返回的额度窗口。凭据只留在 DSH 主机。",
			preview: "预览",
			connected: "已登录",
			disconnected: "未登录",
			accountLoading: "正在读取账户状态…",
			expires: "访问凭据到期时间：{value}。主机会在请求前自动刷新。",
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
			loadFailed: "无法读取 Codex 状态。",
			routePolicy: "路由策略",
			noFallback: "不会静默切换到 OpenAI API 或其他付费路由。",
			usage: "订阅额度",
			usageIntro: "按 ChatGPT Codex 当前返回的额度组和窗口展示；百分比不是 API 账单。",
			refresh: "刷新",
			refreshing: "刷新中…",
			noUsage: "登录后可读取 ChatGPT 返回的额度窗口。",
			usageLoading: "正在读取额度…",
			usageEmpty: "当前账户没有返回可显示的额度窗口。请稍后刷新；这不代表额度为零。",
			usageUpdated: "更新于 {value}",
			remaining: "剩余 {value}%",
			used: "已用 {value}%",
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
			creditsNote: "仅在 Codex 为此账户或工作区实际返回时显示；它们不是订阅周额度之外固定赠送的另一份额度。",
			creditsUsed: "已用 {used} / {limit} credits",
			spendReached: "Credits 月度消费上限已用尽。",
			unavailable: "暂无数据"
		};
		const en = {
			nav: "Codex subscription",
			title: "ChatGPT / Codex subscription",
			intro: "Use your ChatGPT subscription as a native DSH model route and see the quota windows Codex reports. Credentials stay in the DSH host.",
			preview: "Preview",
			connected: "Signed in",
			disconnected: "Not signed in",
			accountLoading: "Reading account status…",
			expires: "Access credential expires at {value}. The host refreshes it before a request.",
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
			loadFailed: "Could not read Codex state.",
			routePolicy: "Routing policy",
			noFallback: "Never silently falls back to the OpenAI API or another paid route.",
			usage: "Subscription quota",
			usageIntro: "Shows the quota buckets and windows ChatGPT Codex currently returns. These percentages are not an API bill.",
			refresh: "Refresh",
			refreshing: "Refreshing…",
			noUsage: "Sign in to read quota windows reported by ChatGPT.",
			usageLoading: "Reading quota…",
			usageEmpty: "This account returned no displayable quota windows. Refresh later; this does not mean zero quota.",
			usageUpdated: "Updated {value}",
			remaining: "{value}% remaining",
			used: "{value}% used",
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
			creditsNote: "Shown only when Codex reports these fields for this account or workspace; they are not a standard second allowance beyond the subscription quota.",
			creditsUsed: "{used} / {limit} credits used",
			spendReached: "The monthly Credits spending cap has been reached.",
			unavailable: "No data yet"
		};
		const STYLE = `
.wslCodex{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.wslCodex h2,.wslCodex h3,.wslCodex p{margin:0}.wslCodexHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wslCodex h2{font-size:16px;line-height:24px;font-weight:500}.wslCodex h3{font-size:14px;line-height:22px;font-weight:500}
.wslCodexTag{border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.wslCodexIntro,.wslCodexNote{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}.wslCodexIntro{margin-top:4px!important}
.wslCodexCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.wslCodexAccountRow,.wslCodexSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.wslCodexStatus{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;font-weight:500}
.wslCodexDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed)}.wslCodexDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}.wslCodexDot[data-state=disconnected]{background:var(--dsw-alias-state-error-primary)}
.wslCodexActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wslCodexFlow{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.wslCodexFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.wslCodexCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.wslCodexError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}.wslCodexInput{width:100%;box-sizing:border-box}
.wslCodexSectionTitle{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.wslCodexFreshness{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.wslCodexRefresh{flex:0 0 auto;min-width:72px;width:max-content;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important}.wslCodexRefresh *{white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important}
.wslCodexEmpty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.wslCodexLimits{display:flex;flex-direction:column;gap:12px}.wslCodexLimitGroup{display:flex;flex-direction:column;gap:8px}.wslCodexLimitName{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.wslCodexQuotaGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.wslCodexLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform);display:flex;flex-direction:column;gap:8px}
.wslCodexLimitTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.wslCodexLimitLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.wslCodexLimit strong{font:600 22px/28px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.wslCodexLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}
.wslCodexLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.wslCodexLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.wslCodexLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.wslCodexLimitMeta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.wslCodexCreditSection{display:flex;flex-direction:column;gap:7px}.wslCodexCreditNote{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.wslCodexCreditRows{display:grid;grid-template-columns:minmax(150px,.65fr) minmax(260px,1.35fr);gap:8px}.wslCodexCreditBalance,.wslCodexSpendLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}
.wslCodexCreditBalance{display:flex;flex-direction:column;gap:6px}.wslCodexCreditBalance span,.wslCodexCreditLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.wslCodexCreditBalance strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.wslCodexSpendLimit{display:flex;flex-direction:column;gap:8px}.wslCodexSpendTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.wslCodexSpendTop strong{font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.wslCodexSpendLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}.wslCodexSpendLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.wslCodexSpendLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.wslCodexSpendLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.wslCodexRoutePolicy{display:flex;gap:8px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.wslCodexRoutePolicy span{flex:0 0 auto;font-weight:500;color:var(--dsw-alias-label-secondary)}
@container (max-width:560px){.wslCodexCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.wslCodexAccountRow,.wslCodexSectionHead{align-items:flex-start;flex-direction:column}.wslCodexActions{width:100%}}
@media(max-width:640px){.wslCodexCard{padding:14px}}
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
					call("login/status", { id: flow.id }).then((next) => {
						setFlow(next);
						if (next.phase === "authenticated") call("status").then(setAccount);
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
				call("login/cancel", { id: flow.id }).then(setFlow).finally(() => setBusy(false));
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
				}).catch(() => setError(t("failed"))).finally(() => setBusy(false));
			};
			const signedIn = account?.authenticated === true;
			const accountReady = account !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wslCodexCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexAccountRow",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "wslCodexStatus",
							role: "status",
							"aria-live": "polite",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "wslCodexDot",
								"data-state": accountReady ? signedIn ? "connected" : "disconnected" : "loading",
								"aria-hidden": "true"
							}), accountReady ? signedIn ? t("connected") : t("disconnected") : t("accountLoading")]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "wslCodexActions",
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
					signedIn && typeof account.expiresAt === "number" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexNote",
						children: fill(t("expires"), { value: new Date(account.expiresAt).toLocaleString() })
					}) : null,
					!signedIn && flow?.phase === "waiting_device" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexFlow",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("deviceHint") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
								className: "wslCodexCode",
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
						className: "wslCodexFlow",
						onSubmit: submit,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("manualCode") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
								className: "wslCodexInput",
								value: manualCode,
								onChange: (event) => setManualCode(event.currentTarget.value),
								autoComplete: "off",
								spellCheck: false
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wslCodexActions",
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
						className: "wslCodexFlow",
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
						className: "wslCodexError",
						role: "alert",
						children: error ?? t("failed")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "wslCodexRoutePolicy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("routePolicy") }), t("noFallback")]
					})
				]
			});
		}
		function ResetTime({ resetsAt, t }) {
			const date = Number.isSafeInteger(resetsAt) ? validDate(resetsAt * 1e3) : void 0;
			if (date === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("resetUnknown") });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
				dateTime: date.toISOString(),
				children: fill(t("resets"), { value: date.toLocaleString() })
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
					if (request.current === id) setUsage(next);
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
			const fetchedAt = typeof visibleUsage?.fetchedAt === "number" ? validDate(visibleUsage.fetchedAt) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wslCodexCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexSectionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "wslCodexSectionTitle",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "wslCodexNote",
									children: t("usageIntro")
								}),
								fetchedAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
									className: "wslCodexFreshness",
									dateTime: fetchedAt.toISOString(),
									children: fill(t("usageUpdated"), { value: fetchedAt.toLocaleString() })
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							className: "wslCodexRefresh",
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
								className: "wslCodexEmpty",
								children: t("noUsage")
							}) : null,
							signedIn && busy && usage === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "wslCodexEmpty",
								role: "status",
								children: t("usageLoading")
							}) : null,
							signedIn && !busy && error === void 0 && usage !== void 0 && limits.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "wslCodexEmpty",
								role: "status",
								children: t("usageEmpty")
							}) : null
						]
					}),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexError",
						role: "alert",
						children: error
					}),
					visibleUsage?.spendControlReached === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexError",
						role: "alert",
						children: t("spendReached")
					}) : null,
					limits.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wslCodexLimits",
						children: limits.map((limit) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "wslCodexLimitGroup",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "wslCodexLimitName",
								children: limit.name ?? limit.id
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "wslCodexQuotaGrid",
								children: limit.windows.map((window, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "wslCodexLimit",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "wslCodexLimitTop",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "wslCodexLimitLabel",
												children: windowLabel(window.windowSeconds, t)
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [percent(window.remainingPercent), "%"] })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
											max: "100",
											value: window.remainingPercent,
											"aria-label": `${limit.name ?? limit.id} ${fill(t("remaining"), { value: percent(window.remainingPercent) })}`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "wslCodexLimitMeta",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("used"), { value: percent(window.usedPercent) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
												resetsAt: window.resetsAt,
												t
											})]
										})
									]
								}, `${limit.id}-${window.windowSeconds}-${index}`))
							})]
						}, limit.id))
					}),
					visibleUsage?.credits === void 0 && visibleUsage?.individualLimit === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexCreditSection",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "wslCodexCreditNote",
							children: t("creditsNote")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "wslCodexCreditRows",
							children: [visibleUsage?.credits ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wslCodexCreditBalance",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("creditsBalance") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: visibleUsage.credits.unlimited ? t("unlimited") : `${visibleUsage.credits.balance ?? t("unavailable")} ${t("creditsUnit")}` })]
							}) : null, visibleUsage?.individualLimit ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "wslCodexSpendLimit",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "wslCodexSpendTop",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "wslCodexCreditLabel",
											children: t("monthlyCreditLimit")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: fill(t("remaining"), { value: percent(visibleUsage.individualLimit.remainingPercent) }) })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
										max: "100",
										value: visibleUsage.individualLimit.remainingPercent,
										"aria-label": `${t("monthlyCreditLimit")} ${fill(t("remaining"), { value: percent(visibleUsage.individualLimit.remainingPercent) })}`
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "wslCodexLimitMeta",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: fill(t("creditsUsed"), {
											used: visibleUsage.individualLimit.used,
											limit: visibleUsage.individualLimit.limit
										}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetTime, {
											resetsAt: visibleUsage.individualLimit.resetsAt,
											t
										})]
									})
								]
							}) : null]
						})]
					})
				]
			});
		}
		function CodexSection({ rpc, t }) {
			const [account, setAccount] = (0, react.useState)();
			const [error, setError] = (0, react.useState)();
			const [resetKey, setResetKey] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let live = true;
				rpc.call(CHANNEL, "status", {}).then(unwrap).then((next) => {
					if (live) setAccount(next);
				}).catch(() => {
					if (live) setError(t("loadFailed"));
				});
				return () => {
					live = false;
				};
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "wslCodex",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "wslCodexTag",
							children: t("preview")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexIntro",
						children: t("intro")
					})] }),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexError",
						role: "alert",
						children: error
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountCard, {
						rpc,
						t,
						account,
						setAccount,
						onSignedOut: () => setResetKey((value) => value + 1)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageCard, {
						rpc,
						t,
						signedIn: account?.authenticated === true,
						resetKey
					})
				]
			});
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "wsl043-codex-subscription: copy");
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "@wsl043/dsh-codex-subscription";
				tag.textContent = STYLE;
				document.head.append(tag);
				return () => tag.remove();
			}, "wsl043-codex-subscription: style");
			const connection = ctx.get("connection");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "codex-subscription",
				order: 15,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					rpc: connection.rpc,
					t
				})
			}, CodexSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map