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
			intro: "将 ChatGPT 订阅作为 DSH 的一个独立模型路由。凭据只保存在 DSH 主机，不会返回网页端。",
			preview: "预览",
			connected: "已登录",
			disconnected: "未登录",
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
			noFallback: "不会静默切换到 OpenAI API 或其他付费路由。",
			usage: "订阅额度",
			refresh: "刷新",
			noUsage: "登录后可读取 ChatGPT 返回的额度窗口。",
			remaining: "剩余 {value}%",
			window: "{value} 小时窗口",
			credits: "可用余额",
			unlimited: "不限额",
			cache: "缓存与续接",
			cacheIntro: "以下数据自本次 DSH 主机启动后累计；三项含义不同，不合并成一个“命中率”。",
			serverCache: "服务端 Token 缓存",
			transport: "WebSocket 增量续接",
			prefix: "稳定前缀",
			cacheRead: "读取 {read} · 写入 {write} · 未缓存 {input}",
			deltaDetail: "增量 {delta} · 完整上下文 {full} · 连接复用 {reused}",
			prefixStable: "未检测到前缀变化",
			prefixChanged: "前缀变化 {value} 次",
			prefixUnseen: "等待首个模型请求",
			measured: "实测",
			unavailable: "暂无数据"
		};
		const en = {
			nav: "Codex subscription",
			title: "ChatGPT / Codex subscription",
			intro: "Add a ChatGPT subscription as an independent DSH model route. Credentials stay in the DSH host and are never returned to this page.",
			preview: "Preview",
			connected: "Signed in",
			disconnected: "Not signed in",
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
			noFallback: "Never silently falls back to the OpenAI API or another paid route.",
			usage: "Subscription quota",
			refresh: "Refresh",
			noUsage: "Sign in to read quota windows reported by ChatGPT.",
			remaining: "{value}% remaining",
			window: "{value}-hour window",
			credits: "Available balance",
			unlimited: "Unlimited",
			cache: "Cache and continuation",
			cacheIntro: "Measured since this DSH host start. These are three different signals and are not merged into one “hit rate”.",
			serverCache: "Server token cache",
			transport: "WebSocket delta continuation",
			prefix: "Stable prefix",
			cacheRead: "read {read} · write {write} · uncached {input}",
			deltaDetail: "delta {delta} · full context {full} · connections reused {reused}",
			prefixStable: "No prefix changes detected",
			prefixChanged: "{value} prefix changes",
			prefixUnseen: "Waiting for the first model request",
			measured: "Measured",
			unavailable: "No data yet"
		};
		const STYLE = `
.wslCodex{display:flex;flex-direction:column;gap:20px;max-width:760px;color:var(--dsw-alias-label-primary);container-type:inline-size}
.wslCodex h2,.wslCodex h3,.wslCodex p{margin:0}.wslCodexHead{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.wslCodex h2{font-size:18px;line-height:26px;font-weight:600}.wslCodex h3{font-size:14px;line-height:22px;font-weight:600}
.wslCodexTag{border:1px solid var(--dsw-alias-border-l3);border-radius:999px;padding:1px 7px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.wslCodexIntro,.wslCodexNote{font-size:13px;line-height:21px;color:var(--dsw-alias-label-tertiary)}
.wslCodexCard{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:16px;display:flex;flex-direction:column;gap:14px}
.wslCodexStatus{display:flex;align-items:center;gap:9px;font-size:14px;line-height:22px;font-weight:600}
.wslCodexDot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}.wslCodexDot[data-on=true]{background:var(--dsw-alias-state-success-primary)}
.wslCodexActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.wslCodexFlow{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:9px;background:var(--dsw-alias-bg-module-platform)}
.wslCodexFlow p{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}.wslCodexCode{width:max-content;max-width:100%;font:600 16px/22px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
.wslCodexError{font-size:13px;line-height:20px;color:var(--dsw-alias-state-error-primary)}.wslCodexInput{width:100%;box-sizing:border-box}
.wslCodexSectionHead{display:flex;align-items:center;justify-content:space-between;gap:12px}.wslCodexMetrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.wslCodexMetric{min-width:0;border:1px solid var(--dsw-alias-border-l3);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px}
.wslCodexMetric strong{font:600 20px/28px ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}.wslCodexMetric span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.wslCodexMetric small{font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}.wslCodexLimits{display:flex;flex-direction:column;gap:8px}
.wslCodexLimit{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;align-items:center}.wslCodexLimit progress{grid-column:1/-1;width:100%;height:6px;accent-color:var(--dsw-alias-brand-primary)}
@container (max-width:560px){.wslCodexMetrics{grid-template-columns:1fr}}
@media(max-width:640px){.wslCodexCard{padding:14px}}
`;
		const unwrap = (response) => {
			if (!response?.ok) throw new Error(response?.error?.message ?? "Codex RPC failed");
			return response.value;
		};
		const fill = (text, values) => Object.entries(values).reduce((next, [key, value]) => next.replace(`{${key}}`, String(value)), text);
		const number = (value) => Number(value ?? 0).toLocaleString();
		const hours = (seconds) => Math.round(seconds / 3600 * 10) / 10;
		function Metric({ label, value, detail }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wslCodexMetric",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: value }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: detail })
				]
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
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wslCodexCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexStatus",
						role: "status",
						"aria-live": "polite",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "wslCodexDot",
							"data-on": signedIn,
							"aria-hidden": "true"
						}), signedIn ? t("connected") : t("disconnected")]
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wslCodexActions",
						children: signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							disabled: busy,
							onClick: logout,
							children: t("logout")
						}) : flow === void 0 || ["failed", "cancelled"].includes(flow.phase) ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
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
					})
				]
			});
		}
		function UsageCard({ rpc, t, signedIn, resetKey }) {
			const [usage, setUsage] = (0, react.useState)();
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)();
			const load = (force) => {
				if (!signedIn) return;
				setBusy(true);
				setError(void 0);
				rpc.call(CHANNEL, "usage", { force }).then(unwrap).then(setUsage).catch((error) => setError(error.message)).finally(() => setBusy(false));
			};
			(0, react.useEffect)(() => {
				if (signedIn) load(false);
				else {
					setUsage(void 0);
					setError(void 0);
				}
			}, [signedIn, resetKey]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wslCodexCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexSectionHead",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("usage") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							type: "button",
							variant: "outline",
							disabled: !signedIn || busy,
							onClick: () => load(true),
							children: t("refresh")
						})]
					}),
					!signedIn ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexNote",
						children: t("noUsage")
					}) : null,
					error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexError",
						role: "alert",
						children: error
					}),
					usage?.rateLimits?.map((limit) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "wslCodexLimits",
						children: limit.windows.map((window, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "wslCodexLimit",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									limit.name ?? limit.id,
									" · ",
									fill(t("window"), { value: hours(window.windowSeconds) })
								] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: fill(t("remaining"), { value: window.remainingPercent }) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
									max: "100",
									value: window.remainingPercent,
									"aria-label": `${limit.name ?? limit.id} ${fill(t("remaining"), { value: window.remainingPercent })}`
								})
							]
						}, `${limit.id}-${window.windowSeconds}`))
					}, limit.id)),
					usage?.credits ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "wslCodexNote",
						children: [
							t("credits"),
							"：",
							usage.credits.unlimited ? t("unlimited") : usage.credits.balance ?? t("unavailable")
						]
					}) : null
				]
			});
		}
		function CacheCard({ rpc, t }) {
			const [cache, setCache] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let live = true;
				const load = () => void rpc.call(CHANNEL, "cache", {}).then(unwrap).then((next) => {
					if (live) setCache(next);
				}).catch(() => {});
				load();
				const timer = window.setInterval(load, 5e3);
				return () => {
					live = false;
					window.clearInterval(timer);
				};
			}, []);
			const serverCache = cache?.serverCache;
			const transport = cache?.transport;
			const prefix = cache?.prefix;
			const prefixDetail = prefix?.state === "stable" ? t("prefixStable") : prefix?.state === "changed" ? fill(t("prefixChanged"), { value: prefix.changes }) : t("prefixUnseen");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "wslCodexCard",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("cache") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexNote",
						children: t("cacheIntro")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "wslCodexMetrics",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("serverCache"),
								value: serverCache ? `${serverCache.hitPercent}%` : "—",
								detail: serverCache ? fill(t("cacheRead"), {
									read: number(serverCache.readTokens),
									write: number(serverCache.writeTokens),
									input: number(serverCache.uncachedInputTokens)
								}) : t("unavailable")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("transport"),
								value: transport ? `${transport.deltaPercent}%` : "—",
								detail: transport ? fill(t("deltaDetail"), {
									delta: number(transport.deltaRequests),
									full: number(transport.fullContextRequests),
									reused: number(transport.connectionsReused)
								}) : t("unavailable")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("prefix"),
								value: prefix?.state === "stable" ? t("measured") : prefix?.state === "changed" ? number(prefix.changes) : "—",
								detail: prefixDetail
							})
						]
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
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CacheCard, {
						rpc,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "wslCodexNote",
						children: t("noFallback")
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