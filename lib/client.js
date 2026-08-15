window.__ModuleLoader__.load({
	id: "dsh-codex-subscription",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/settings-contract.js
		const SIDEBAR_QUOTA_FIELD = "sidebarQuotaVisible";
		//#endregion
		//#region src/sidebar-quota.js
		const isDisplayableWindow = (window) => Number.isFinite(window?.remainingPercent) && window.remainingPercent >= 0 && window.remainingPercent <= 100 && Number.isFinite(window?.windowSeconds) && window.windowSeconds > 0;
		function selectSidebarQuota(usage) {
			const windows = Array.isArray(usage?.rateLimits) ? usage.rateLimits.filter((limit) => limit?.id === "codex" && Array.isArray(limit.windows)).flatMap((limit) => limit.windows).filter(isDisplayableWindow) : [];
			if (windows.length === 0) return void 0;
			const selected = windows.reduce((lowest, candidate) => candidate.remainingPercent < lowest.remainingPercent ? candidate : lowest);
			return {
				remainingPercent: selected.remainingPercent,
				windowSeconds: selected.windowSeconds,
				...Number.isSafeInteger(selected.resetsAt) ? { resetsAt: selected.resetsAt } : {}
			};
		}
		//#endregion
		//#region src/client.jsx
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		const NS = "settings.codexSubscription";
		const CHANNEL = "/codex-subscription";
		const SIDEBAR_REFRESH_EVENT = "dsh-codex-subscription:refresh-sidebar-quota";
		const SIDEBAR_REFRESH_MS = 6e4;
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
			resetCredits: "可用额度重置次数",
			resetCreditsValue: "{count} 次",
			creditsNote: "仅显示 Codex 为此账户或工作区实际返回的额外 Credits、消费上限或额度重置次数；三者不是同一项。",
			creditsUsed: "已用 {used} / {limit} credits",
			spendReached: "Credits 月度消费上限已用尽。",
			unavailable: "暂无数据",
			sidebarQuotaSetting: "在侧边栏显示额度",
			sidebarQuotaStatus: "Codex 剩余额度 {value}%"
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
			resetCredits: "Available quota resets",
			resetCreditsValue: "{count} available",
			creditsNote: "Shows only extra Credits, spending caps, or quota resets returned for this account or workspace; these are separate items.",
			creditsUsed: "{used} / {limit} credits used",
			spendReached: "The monthly Credits spending cap has been reached.",
			unavailable: "No data yet",
			sidebarQuotaSetting: "Show quota in sidebar",
			sidebarQuotaStatus: "Codex quota: {value}% remaining"
		};
		const STYLE = `
.codexSubscription{display:flex;flex-direction:column;gap:12px;max-width:720px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.codexSubscription h2,.codexSubscription h3,.codexSubscription p{margin:0}.codexSubscriptionHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.codexSubscription h2{font-size:16px;line-height:24px;font-weight:500}.codexSubscription h3{font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionTag{border:1px solid var(--dsw-alias-border-l3);border-radius:4px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionIntro,.codexSubscriptionNote{font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionIntro{margin-top:4px!important}
.codexSubscriptionCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.codexSubscriptionUsageCard{padding:12px 14px;gap:9px}.codexSubscriptionPreference{min-height:40px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 4px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.codexSubscriptionSwitch{position:relative;flex:0 0 auto;width:32px;height:18px;padding:0;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--dsw-alias-bg-module-platform);cursor:pointer}.codexSubscriptionSwitch:disabled{cursor:not-allowed;opacity:.5}.codexSubscriptionSwitch[aria-checked=true]{background:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-label-secondary)}.codexSubscriptionSwitchKnob{position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-bg-layer-1);transition:transform 120ms var(--ds-ease-in-out)}.codexSubscriptionSwitch[aria-checked=true] .codexSubscriptionSwitchKnob{transform:translateX(14px)}
.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.codexSubscriptionStatus{display:flex;align-items:center;gap:8px;font-size:14px;line-height:22px;font-weight:500}
.codexSubscriptionDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-label-dimmed)}.codexSubscriptionDot[data-state=connected]{background:var(--dsw-alias-state-success-primary)}.codexSubscriptionDot[data-state=disconnected]{background:var(--dsw-alias-state-error-primary)}
.codexSubscriptionActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.codexSubscriptionFlow{display:flex;flex-direction:column;gap:10px;padding:12px 14px;border-radius:10px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.codexSubscriptionError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}.codexSubscriptionInput{width:100%;box-sizing:border-box}
.codexSubscriptionSectionTitle{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}.codexSubscriptionFreshness{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionRefresh{flex:0 0 auto;min-width:72px;width:max-content;white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important;writing-mode:horizontal-tb!important}.codexSubscriptionRefresh *{white-space:nowrap!important;word-break:keep-all!important;writing-mode:horizontal-tb!important}
.codexSubscriptionEmpty{padding:18px;border:1px dashed var(--dsw-alias-border-l3);border-radius:10px;text-align:center;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionLimits{display:flex;flex-direction:column;gap:8px}.codexSubscriptionLimitGroup{display:flex;flex-direction:column;gap:6px}.codexSubscriptionLimitName{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.codexSubscriptionQuotaGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:6px}.codexSubscriptionLimit{min-width:0;border-radius:10px;padding:9px 12px;background:var(--dsw-alias-bg-module-platform);display:flex;flex-direction:column;gap:6px}
.codexSubscriptionLimitTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexSubscriptionLimitLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionLimit strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.codexSubscriptionLimit progress{width:100%;height:4px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}
.codexSubscriptionLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexSubscriptionLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionLimitMeta{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.codexSubscriptionCreditSection{display:flex;flex-direction:column;gap:7px}.codexSubscriptionCreditNote{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionCreditRows{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.codexSubscriptionCreditBalance,.codexSubscriptionSpendLimit{min-width:0;border-radius:10px;padding:12px 14px;background:var(--dsw-alias-bg-module-platform)}
.codexSubscriptionCreditBalance{display:flex;flex-direction:column;gap:6px}.codexSubscriptionCreditBalance span,.codexSubscriptionCreditLabel{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.codexSubscriptionCreditBalance strong{font:600 18px/24px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.codexSubscriptionSpendLimit{display:flex;flex-direction:column;gap:8px}.codexSubscriptionSpendTop{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.codexSubscriptionSpendTop strong{font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.codexSubscriptionSpendLimit progress{width:100%;height:6px;border:0;border-radius:999px;overflow:hidden;background:var(--dsw-alias-border-l3);accent-color:var(--dsw-alias-brand-primary,#3964fe);-webkit-appearance:none;appearance:none}.codexSubscriptionSpendLimit progress::-webkit-progress-bar{background:var(--dsw-alias-border-l3);border-radius:999px}.codexSubscriptionSpendLimit progress::-webkit-progress-value{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}.codexSubscriptionSpendLimit progress::-moz-progress-bar{background:var(--dsw-alias-brand-primary,#3964fe);border-radius:999px}
.codexSubscriptionRoutePolicy{display:flex;gap:8px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}.codexSubscriptionRoutePolicy span{flex:0 0 auto;font-weight:500;color:var(--dsw-alias-label-secondary)}
.codexSidebarQuota{width:100%;height:34px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;overflow:hidden;user-select:none}.codexSidebarQuotaLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary)}.codexSidebarQuotaValue{flex:0 0 auto;font:600 12px/18px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.codexSidebarQuotaRail{width:36px;height:36px;padding:0;justify-content:center;border-radius:50%}.codexSidebarQuotaRailValue{display:flex;align-items:baseline;justify-content:center;letter-spacing:-.03em;font:600 10px/12px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.codexSidebarQuotaRailValue small{font:500 7px/9px ui-monospace,SFMono-Regular,Consolas,monospace}
@container (max-width:560px){.codexSubscriptionCreditRows{grid-template-columns:1fr}}
@container (max-width:480px){.codexSubscriptionAccountRow,.codexSubscriptionSectionHead{align-items:flex-start;flex-direction:column}.codexSubscriptionActions{width:100%}}
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
		function createPreferenceController(rpc) {
			let snapshot = Object.freeze({
				status: "loading",
				visible: true,
				writable: false
			});
			let generation = 0;
			const listeners = /* @__PURE__ */ new Set();
			const publish = (next) => {
				snapshot = Object.freeze(next);
				for (const listener of listeners) listener();
			};
			const accept = (value) => publish({
				status: "ready",
				visible: value?.[SIDEBAR_QUOTA_FIELD] !== false,
				writable: value?.writable === true
			});
			const load = async () => {
				const current = ++generation;
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/status", {}));
					if (current === generation) accept(value);
				} catch {
					if (current === generation) publish({
						status: "unavailable",
						visible: true,
						writable: false
					});
				}
			};
			const set = async (visible) => {
				if (snapshot.status !== "ready" || snapshot.writable !== true) return;
				const current = ++generation;
				publish({
					status: "updating",
					visible,
					writable: false
				});
				try {
					const value = unwrap(await rpc.call(CHANNEL, "preferences/update", { [SIDEBAR_QUOTA_FIELD]: visible }));
					if (current === generation) accept(value);
				} catch {
					if (current === generation) await load();
				}
			};
			return {
				getSnapshot: () => snapshot,
				subscribe: (listener) => {
					listeners.add(listener);
					return () => listeners.delete(listener);
				},
				load,
				set
			};
		}
		const usePreferenceSnapshot = (preference) => (0, react.useSyncExternalStore)(preference.subscribe, preference.getSnapshot);
		const notifySidebarQuota = () => window.dispatchEvent(new Event(SIDEBAR_REFRESH_EVENT));
		function useSidebarQuota(rpc, enabled) {
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
						if (live) setQuota(selectSidebarQuota(usage));
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
				const timer = window.setInterval(refresh, SIDEBAR_REFRESH_MS);
				window.addEventListener(SIDEBAR_REFRESH_EVENT, refresh);
				return () => {
					live = false;
					window.clearInterval(timer);
					window.removeEventListener(SIDEBAR_REFRESH_EVENT, refresh);
				};
			}, [rpc, enabled]);
			return quota;
		}
		function SidebarQuotaPreference({ preference, t }) {
			const snapshot = usePreferenceSnapshot(preference);
			const visible = snapshot.visible;
			const writable = snapshot.status === "ready" && snapshot.writable === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionPreference",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("sidebarQuotaSetting") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					className: "codexSubscriptionSwitch",
					type: "button",
					role: "switch",
					"aria-checked": visible,
					"aria-label": t("sidebarQuotaSetting"),
					disabled: !writable,
					onClick: () => {
						preference.set(!visible);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "codexSubscriptionSwitchKnob",
						"aria-hidden": "true"
					})
				})]
			});
		}
		function CodexSidebarQuota({ preference, rpc, t, wide }) {
			const preferenceSnapshot = usePreferenceSnapshot(preference);
			const enabled = preferenceSnapshot.status === "ready" && preferenceSnapshot.visible;
			const quota = useSidebarQuota(rpc, enabled);
			if (!enabled || quota === void 0) return null;
			const value = percent(quota.remainingPercent);
			const label = fill(t("sidebarQuotaStatus"), { value });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: `codexSidebarQuota${wide ? "" : " codexSidebarQuotaRail"}`,
				role: "status",
				"aria-label": label,
				title: label,
				children: wide ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "codexSidebarQuotaLabel",
					children: "Codex"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexSidebarQuotaValue",
					children: [value, "%"]
				})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "codexSidebarQuotaRailValue",
					children: [value, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "%" })]
				})
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
					call("login/status", { id: flow.id }).then((next) => {
						setFlow(next);
						if (next.phase === "authenticated") call("status").then((account) => {
							setAccount(account);
							notifySidebarQuota();
						});
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
					notifySidebarQuota();
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
					signedIn && typeof account.expiresAt === "number" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionNote",
						children: fill(t("expires"), { value: new Date(account.expiresAt).toLocaleString() })
					}) : null,
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
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "codexSubscriptionRoutePolicy",
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
					if (request.current === id) {
						setUsage(next);
						if (force) notifySidebarQuota();
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
			const hasUsageDetails = limits.length > 0 || visibleUsage?.credits !== void 0 || visibleUsage?.individualLimit !== void 0 || visibleUsage?.resetCredits !== void 0;
			const fetchedAt = typeof visibleUsage?.fetchedAt === "number" ? validDate(visibleUsage.fetchedAt) : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "codexSubscriptionCard codexSubscriptionUsageCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionSectionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionSectionTitle",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "codexSubscriptionNote",
									children: t("usageIntro")
								}),
								fetchedAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
									className: "codexSubscriptionFreshness",
									dateTime: fetchedAt.toISOString(),
									children: fill(t("usageUpdated"), { value: fetchedAt.toLocaleString() })
								})
							]
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
						children: limits.map((limit) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "codexSubscriptionLimitGroup",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSubscriptionLimitName",
								children: limit.name ?? limit.id
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "codexSubscriptionQuotaGrid",
								children: limit.windows.map((window, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "codexSubscriptionLimit",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionLimitTop",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "codexSubscriptionLimitLabel",
												children: windowLabel(window.windowSeconds, t)
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [percent(window.remainingPercent), "%"] })]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
											max: "100",
											value: window.remainingPercent,
											"aria-label": `${limit.name ?? limit.id} ${fill(t("remaining"), { value: percent(window.remainingPercent) })}`
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: "codexSubscriptionLimitMeta",
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
					visibleUsage?.credits === void 0 && visibleUsage?.individualLimit === void 0 && visibleUsage?.resetCredits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
								visibleUsage?.resetCredits ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
				className: "codexSubscription",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "codexSubscriptionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: t("title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "codexSubscriptionTag",
							children: t("preview")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionIntro",
						children: t("intro")
					})] }),
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "codexSubscriptionError",
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SidebarQuotaPreference, {
						preference,
						t
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
			}), "codex-subscription: copy");
			ctx.effect(() => {
				const tag = document.createElement("style");
				tag.dataset.plugin = "dsh-codex-subscription";
				tag.textContent = STYLE;
				document.head.append(tag);
				return () => tag.remove();
			}, "codex-subscription: style");
			const connection = ctx.get("connection");
			const preference = createPreferenceController(connection.rpc);
			ctx.effect(() => {
				preference.load();
				return ctx.on("connection/reset", () => {
					preference.load();
				});
			}, "codex-subscription: sidebar preference");
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
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "codex-subscription-quota",
				order: 15,
				locale: NS,
				inject: () => ({
					preference,
					rpc: connection.rpc,
					t
				})
			}, CodexSidebarQuota));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map