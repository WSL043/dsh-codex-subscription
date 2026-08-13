import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { LlmError } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createModels } from "@earendil-works/pi-ai";
import { getOpenAICodexWebSocketDebugStats } from "@earendil-works/pi-ai/api/openai-codex-responses";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
//#region src/cache-telemetry.js
const percent = (part, whole) => whole <= 0 ? 0 : Math.round(part / whole * 1e3) / 10;
function canonical(value) {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
	return JSON.stringify(value);
}
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");
function prefixParts(request) {
	return {
		model: digest({
			provider: request.provider,
			model: request.model
		}),
		system: digest(String(request.system ?? "")),
		tools: digest(request.tools ?? [])
	};
}
/** Hash only the model-visible stable prefix. Conversation messages are excluded. */
function prefixFingerprint(request) {
	return digest(prefixParts(request));
}
const nonNegative = (value) => Number.isFinite(value) && value > 0 ? value : 0;
/**
* Process-local, content-free cache observability. It deliberately keeps only
* hashes per session and returns aggregate counters, never prompts or ids.
*/
var CodexCacheTelemetry = class {
	#sessions = /* @__PURE__ */ new Map();
	#now;
	#maxSessions;
	#evictedSessions = 0;
	#requests = 0;
	#prefixChanges = 0;
	#lastChangedComponent;
	#input = 0;
	#cacheRead = 0;
	#cacheWrite = 0;
	#output = 0;
	#transport = {
		connectionsCreated: 0,
		connectionsReused: 0,
		cachedContextRequests: 0,
		fullContextRequests: 0,
		deltaRequests: 0,
		websocketFailures: 0,
		sseFallbacks: 0
	};
	constructor(options = {}) {
		this.#now = options.now ?? Date.now;
		this.#maxSessions = options.maxSessions ?? 512;
		if (!Number.isInteger(this.#maxSessions) || this.#maxSessions <= 0) throw new Error("Codex cache telemetry maxSessions must be a positive integer");
	}
	#remember(id, session) {
		this.#sessions.delete(id);
		this.#sessions.set(id, session);
		while (this.#sessions.size > this.#maxSessions) {
			const oldest = this.#sessions.keys().next().value;
			this.#sessions.delete(oldest);
			this.#evictedSessions += 1;
		}
	}
	begin(request) {
		const id = String(request.sessionId ?? "");
		const parts = prefixParts(request);
		const previous = this.#sessions.get(id);
		if (previous !== void 0) {
			for (const component of [
				"model",
				"system",
				"tools"
			]) if (previous.parts[component] !== parts[component]) {
				this.#prefixChanges += 1;
				this.#lastChangedComponent = component;
				break;
			}
		}
		this.#remember(id, {
			parts,
			ws: previous?.ws,
			seenAt: this.#now()
		});
		this.#requests += 1;
	}
	finish(request, usage = {}, websocketStats) {
		this.#input += nonNegative(usage.inputTokens);
		this.#cacheRead += nonNegative(usage.cacheReadTokens);
		this.#cacheWrite += nonNegative(usage.cacheWriteTokens);
		this.#output += nonNegative(usage.outputTokens);
		if (websocketStats === void 0) return;
		const id = String(request.sessionId ?? "");
		const session = this.#sessions.get(id) ?? {
			parts: prefixParts(request),
			seenAt: this.#now()
		};
		const previous = session.ws ?? {};
		for (const key of Object.keys(this.#transport)) {
			const current = nonNegative(websocketStats[key]);
			const before = nonNegative(previous[key]);
			this.#transport[key] += Math.max(0, current - before);
		}
		session.ws = structuredClone(websocketStats);
		session.seenAt = this.#now();
		this.#remember(id, session);
	}
	snapshot() {
		const cacheEligible = this.#input + this.#cacheRead + this.#cacheWrite;
		return {
			requests: this.#requests,
			observedAt: this.#now(),
			trackedSessions: this.#sessions.size,
			sessionCapacity: this.#maxSessions,
			evictedSessions: this.#evictedSessions,
			serverCache: {
				uncachedInputTokens: this.#input,
				readTokens: this.#cacheRead,
				writeTokens: this.#cacheWrite,
				outputTokens: this.#output,
				hitPercent: percent(this.#cacheRead, cacheEligible)
			},
			transport: {
				...this.#transport,
				deltaPercent: percent(this.#transport.deltaRequests, this.#transport.cachedContextRequests)
			},
			prefix: {
				state: this.#requests === 0 ? "unseen" : this.#prefixChanges === 0 ? "stable" : "changed",
				changes: this.#prefixChanges,
				...this.#lastChangedComponent === void 0 ? {} : { lastChangedComponent: this.#lastChangedComponent }
			}
		};
	}
};
//#endregion
//#region src/credential-store.js
const PROVIDER$1 = "openai-codex";
const abortIfNeeded = (options) => options?.signal?.throwIfAborted();
const clone = (value) => value === void 0 ? void 0 : structuredClone(value);
function assertProvider(providerId) {
	if (providerId !== PROVIDER$1) throw new Error(`Codex credential store does not own provider ${JSON.stringify(providerId)}`);
}
function assertOAuthCredential(value) {
	if (value === void 0) return void 0;
	if (value === null || typeof value !== "object" || value.type !== "oauth" || typeof value.access !== "string" || value.access.length === 0 || typeof value.refresh !== "string" || value.refresh.length === 0 || typeof value.expires !== "number" || !Number.isFinite(value.expires)) throw new Error("Codex credential store received a malformed OAuth credential");
	return clone(value);
}
/**
* Adapt DSH's managed string credential service to pi-ai's typed OAuth store.
* Refresh/login/logout operations are serialized so an older refresh response
* cannot overwrite a newer rotated token.
*/
var DshOAuthCredentialStore = class {
	#chains = /* @__PURE__ */ new Map();
	constructor(credentials, ref) {
		if (credentials === void 0 || credentials === null) throw new Error("Codex OAuth requires the DSH credentials service");
		this.credentials = credentials;
		this.ref = ref;
	}
	#enqueue(providerId, operation, options) {
		assertProvider(providerId);
		const current = (this.#chains.get(providerId) ?? Promise.resolve()).catch(() => void 0).then(async () => {
			abortIfNeeded(options);
			return operation();
		});
		const tail = current.catch(() => void 0);
		this.#chains.set(providerId, tail);
		tail.finally(() => {
			if (this.#chains.get(providerId) === tail) this.#chains.delete(providerId);
		});
		return current;
	}
	async read(providerId, options) {
		assertProvider(providerId);
		abortIfNeeded(options);
		const hit = await this.credentials.resolve(this.ref);
		abortIfNeeded(options);
		if (hit?.value === void 0 || hit.value === "") return void 0;
		let parsed;
		try {
			parsed = JSON.parse(hit.value);
		} catch (error) {
			throw new Error("Codex credential store contains malformed OAuth JSON", { cause: error });
		}
		return assertOAuthCredential(parsed);
	}
	async list(options) {
		abortIfNeeded(options);
		return await this.read(PROVIDER$1, options) === void 0 ? [] : [{
			providerId: PROVIDER$1,
			type: "oauth"
		}];
	}
	modify(providerId, update, options) {
		return this.#enqueue(providerId, async () => {
			const current = await this.read(providerId, options);
			const next = await update(clone(current));
			abortIfNeeded(options);
			if (next === void 0) return current;
			const validated = assertOAuthCredential(next);
			await this.credentials.set(this.ref, JSON.stringify(validated));
			abortIfNeeded(options);
			return clone(validated);
		}, options);
	}
	delete(providerId, options) {
		return this.#enqueue(providerId, async () => {
			await this.credentials.unset(this.ref);
			abortIfNeeded(options);
		}, options);
	}
};
/** Return only account state that is safe to expose to the browser client. */
function createCodexAuthService(models, store) {
	return Object.freeze({
		async status(options) {
			const current = await store.read(PROVIDER$1, options);
			if (current === void 0) return {
				authenticated: false,
				provider: PROVIDER$1
			};
			return {
				authenticated: true,
				provider: PROVIDER$1,
				type: "oauth",
				expiresAt: current.expires
			};
		},
		login(interaction) {
			return models.login(PROVIDER$1, "oauth", interaction);
		},
		logout(options) {
			return models.logout(PROVIDER$1, options);
		}
	});
}
//#endregion
//#region src/external-url.js
const OPENAI_AUTH_ORIGIN = "https://auth.openai.com";
/** Validate the only external origin this plugin may launch. */
function assertCodexAuthUrl(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error("Codex auth URL is invalid");
	}
	if (url.protocol !== "https:") throw new Error("Codex auth URL must use HTTPS");
	if (url.origin !== OPENAI_AUTH_ORIGIN || url.username !== "" || url.password !== "") throw new Error("Codex auth URL must use the OpenAI auth origin");
	return url.href;
}
/** Return a shell-free native opener command for the current desktop. */
function commandForCodexAuthUrl(value, platform = process.platform) {
	const url = assertCodexAuthUrl(value);
	if (platform === "win32") return {
		file: "rundll32.exe",
		args: ["url.dll,FileProtocolHandler", url],
		shell: false
	};
	if (platform === "darwin") return {
		file: "open",
		args: [url],
		shell: false
	};
	if (platform === "linux") return {
		file: "xdg-open",
		args: [url],
		shell: false
	};
	throw new Error(`Codex auth URL opener is unsupported on ${platform}`);
}
function openCodexAuthUrl(value, options = {}) {
	const command = commandForCodexAuthUrl(value, options.platform);
	const spawnProcess = options.spawn ?? spawn;
	return new Promise((resolve, reject) => {
		const child = spawnProcess(command.file, command.args, {
			detached: true,
			stdio: "ignore",
			windowsHide: true,
			shell: command.shell
		});
		child.once("error", reject);
		child.once("spawn", () => {
			child.unref();
			resolve();
		});
	});
}
//#endregion
//#region src/login-coordinator.js
const LOGIN_METHODS = /* @__PURE__ */ new Set(["browser", "device_code"]);
const TERMINAL_PHASES = /* @__PURE__ */ new Set([
	"authenticated",
	"failed",
	"cancelled"
]);
const publicClone = (value) => structuredClone(value);
const asObject = (value) => value !== null && typeof value === "object" ? value : {};
const ok = (value) => ({
	ok: true,
	value
});
const badRequest = (message) => ({
	ok: false,
	error: {
		code: "bad-request",
		message,
		details: { issues: [] }
	}
});
const deferred = () => {
	let resolve;
	let reject;
	return {
		promise: new Promise((onResolve, onReject) => {
			resolve = onResolve;
			reject = onReject;
		}),
		resolve,
		reject
	};
};
const publicPrompt = (prompt) => ({
	type: prompt.type,
	message: String(prompt.message ?? ""),
	...typeof prompt.placeholder === "string" ? { placeholder: prompt.placeholder } : {}
});
/** Own one host-side login without exposing tokens to the browser client. */
var CodexLoginCoordinator = class {
	#sessions = /* @__PURE__ */ new Map();
	#activeId;
	constructor(auth, options = {}) {
		this.auth = auth;
		this.createId = options.createId ?? (() => crypto.randomUUID());
	}
	async accountStatus(options) {
		return publicClone(await this.auth.status(options));
	}
	async start({ method }) {
		if (!LOGIN_METHODS.has(method)) throw new Error(`unsupported Codex login method: ${String(method)}`);
		const active = this.#activeId === void 0 ? void 0 : this.#sessions.get(this.#activeId);
		if (active !== void 0 && !TERMINAL_PHASES.has(active.view.phase)) throw new Error("a Codex login is already active");
		const id = this.createId();
		const ready = deferred();
		const controller = new AbortController();
		const session = {
			controller,
			prompt: void 0,
			ready,
			view: {
				id,
				provider: "openai-codex",
				method,
				phase: "starting",
				authenticated: false
			}
		};
		this.#sessions.set(id, session);
		this.#activeId = id;
		const publishReady = () => ready.resolve(this.read(id));
		const interaction = {
			signal: controller.signal,
			prompt: async (prompt) => {
				controller.signal.throwIfAborted();
				if (prompt.type === "select") return method;
				if (![
					"manual_code",
					"text",
					"secret"
				].includes(prompt.type)) throw new Error(`unsupported Codex auth prompt: ${String(prompt.type)}`);
				const answer = deferred();
				session.prompt = answer;
				session.view = {
					...session.view,
					phase: "waiting_input",
					prompt: publicPrompt(prompt)
				};
				const abortPrompt = () => answer.reject(controller.signal.reason ?? /* @__PURE__ */ new Error("login cancelled"));
				controller.signal.addEventListener("abort", abortPrompt, { once: true });
				prompt.signal?.addEventListener("abort", abortPrompt, { once: true });
				publishReady();
				try {
					return await answer.promise;
				} finally {
					controller.signal.removeEventListener("abort", abortPrompt);
					prompt.signal?.removeEventListener("abort", abortPrompt);
					if (session.prompt === answer) session.prompt = void 0;
				}
			},
			notify: (event) => {
				if (controller.signal.aborted) return;
				if (event.type === "auth_url") session.view = {
					...session.view,
					phase: "waiting_browser",
					authUrl: assertCodexAuthUrl(event.url),
					...typeof event.instructions === "string" ? { instructions: event.instructions } : {}
				};
				else if (event.type === "device_code") session.view = {
					...session.view,
					phase: "waiting_device",
					deviceCode: {
						userCode: event.userCode,
						verificationUri: assertCodexAuthUrl(event.verificationUri),
						...typeof event.intervalSeconds === "number" ? { intervalSeconds: event.intervalSeconds } : {},
						...typeof event.expiresInSeconds === "number" ? { expiresInSeconds: event.expiresInSeconds } : {}
					}
				};
				else session.view = {
					...session.view,
					message: String(event.message ?? "")
				};
				publishReady();
			}
		};
		session.run = Promise.resolve().then(() => this.auth.login(interaction)).then(async () => {
			if (controller.signal.aborted) return;
			const status = await this.auth.status();
			session.view = {
				id,
				provider: "openai-codex",
				method,
				phase: "authenticated",
				authenticated: status.authenticated === true,
				...typeof status.expiresAt === "number" ? { expiresAt: status.expiresAt } : {}
			};
		}).catch((error) => {
			if (controller.signal.aborted) {
				session.view = {
					id,
					provider: "openai-codex",
					method,
					phase: "cancelled",
					authenticated: false
				};
				return;
			}
			session.view = {
				id,
				provider: "openai-codex",
				method,
				phase: "failed",
				authenticated: false,
				error: "Codex login failed"
			};
			session.hostError = error;
		}).finally(publishReady);
		return ready.promise;
	}
	read(id) {
		const session = this.#sessions.get(id);
		if (session === void 0) throw new Error("unknown Codex login");
		return publicClone(session.view);
	}
	async submit({ id, value }) {
		const session = this.#sessions.get(id);
		if (session === void 0) throw new Error("unknown Codex login");
		if (session.prompt === void 0 || session.view.phase !== "waiting_input") throw new Error("Codex login is not waiting for input");
		if (typeof value !== "string" || value.trim() === "") throw new Error("Codex login input is empty");
		const answer = session.prompt;
		session.prompt = void 0;
		session.view = {
			...session.view,
			phase: session.view.authUrl === void 0 ? "starting" : "waiting_browser",
			prompt: void 0
		};
		answer.resolve(value);
		return this.read(id);
	}
	async cancel(id) {
		const session = this.#sessions.get(id);
		if (session === void 0) throw new Error("unknown Codex login");
		if (!TERMINAL_PHASES.has(session.view.phase)) {
			session.view = {
				id,
				provider: "openai-codex",
				method: session.view.method,
				phase: "cancelled",
				authenticated: false
			};
			session.controller.abort(/* @__PURE__ */ new Error("Codex login cancelled"));
		}
		await Promise.resolve(session.run).catch(() => void 0);
		return this.read(id);
	}
	async logout(options) {
		if (this.#activeId !== void 0) {
			const active = this.#sessions.get(this.#activeId);
			if (active !== void 0 && !TERMINAL_PHASES.has(active.view.phase)) await this.cancel(active.view.id);
		}
		await this.auth.logout(options);
		return this.accountStatus(options);
	}
};
/** Map the loopback-only DSH Connection channel onto the coordinator. */
function createCodexRpcHandler(coordinator, options = {}) {
	const openExternal = options.openExternal;
	return async (endpoint, payload, signal) => {
		try {
			signal.throwIfAborted();
			const input = asObject(payload);
			if (endpoint === "status") return ok(await coordinator.accountStatus({ signal }));
			if (endpoint === "login/start") {
				const started = await coordinator.start({ method: input.method });
				if (input.openExternal !== true) return ok(started);
				const url = started.authUrl ?? started.deviceCode?.verificationUri;
				if (typeof url !== "string" || openExternal === void 0) return ok({
					...started,
					externalOpened: false
				});
				try {
					await openExternal(url);
					return ok({
						...started,
						externalOpened: true
					});
				} catch {
					return ok({
						...started,
						externalOpened: false
					});
				}
			}
			if (endpoint === "login/status") return ok(coordinator.read(input.id));
			if (endpoint === "login/submit") return ok(await coordinator.submit({
				id: input.id,
				value: input.value
			}));
			if (endpoint === "login/cancel") return ok(await coordinator.cancel(input.id));
			if (endpoint === "logout") return ok(await coordinator.logout({ signal }));
			return badRequest(`unknown Codex auth endpoint: ${endpoint}`);
		} catch (error) {
			if (signal.aborted) throw error;
			const message = error instanceof Error && /^(unknown|unsupported|a Codex|Codex login)/.test(error.message) ? error.message : "Codex request failed";
			return badRequest(message);
		}
	};
}
//#endregion
//#region src/usage.js
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const DEFAULT_TTL_MS = 6e4;
const DEFAULT_TIMEOUT_MS = 15e3;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function windowOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record(value)) throw new Error("Codex returned a malformed rate-limit window");
	const used = value.used_percent;
	const seconds = value.limit_window_seconds;
	if (!Number.isFinite(used) || used < 0 || used > 100) throw new Error("Codex returned an invalid used percentage");
	if (!Number.isInteger(seconds) || seconds <= 0) throw new Error("Codex returned an invalid window duration");
	return {
		remainingPercent: 100 - used,
		windowSeconds: seconds
	};
}
function limitOf(id, name, value) {
	if (value === void 0 || value === null) return void 0;
	if (!record(value)) throw new Error("Codex returned malformed rate-limit details");
	const windows = [windowOf(value.primary_window), windowOf(value.secondary_window)].filter(Boolean);
	return windows.length === 0 ? void 0 : {
		id,
		...name ? { name } : {},
		windows
	};
}
function decimal(value, label) {
	if (typeof value !== "string" || value.length === 0 || value.length > 64 || !/^-?\d+(?:\.\d+)?$/u.test(value)) throw new Error(`Codex returned an invalid ${label}`);
	return value;
}
function creditsOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record(value) || typeof value.has_credits !== "boolean" || typeof value.unlimited !== "boolean") throw new Error("Codex returned malformed credit details");
	if (!value.has_credits) return void 0;
	return {
		unlimited: value.unlimited,
		...value.balance === void 0 || value.balance === null ? {} : { balance: decimal(value.balance, "credit balance") }
	};
}
function individualOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record(value)) throw new Error("Codex returned malformed spend control");
	const item = value.individual_limit;
	if (item === void 0 || item === null) return void 0;
	if (!record(item) || !Number.isFinite(item.remaining_percent) || item.remaining_percent < 0 || item.remaining_percent > 100) throw new Error("Codex returned an invalid individual-limit percentage");
	return {
		limit: decimal(item.limit, "individual limit"),
		used: decimal(item.used, "individual usage"),
		remaining: decimal(item.remaining, "individual remaining balance"),
		remainingPercent: item.remaining_percent
	};
}
/** Reduce the provider payload to a browser-safe quota projection. */
function parseCodexUsage(value) {
	if (!record(value)) throw new Error("Codex returned a malformed usage response");
	const rateLimits = [];
	const primary = limitOf("codex", "Codex", value.rate_limit);
	if (primary) rateLimits.push(primary);
	if (value.additional_rate_limits !== void 0 && value.additional_rate_limits !== null && !Array.isArray(value.additional_rate_limits)) throw new Error("Codex returned malformed additional rate limits");
	for (const entry of value.additional_rate_limits ?? []) {
		if (!record(entry) || typeof entry.metered_feature !== "string" || entry.metered_feature.length === 0) throw new Error("Codex returned a malformed additional rate limit");
		if (entry.limit_name !== void 0 && entry.limit_name !== null && typeof entry.limit_name !== "string") throw new Error("Codex returned an invalid additional rate-limit name");
		const next = limitOf(entry.metered_feature, entry.limit_name || void 0, entry.rate_limit);
		if (next) rateLimits.push(next);
	}
	const credits = creditsOf(value.credits);
	const individualLimit = individualOf(value.spend_control);
	return {
		rateLimits,
		...credits === void 0 ? {} : { credits },
		...individualLimit === void 0 ? {} : { individualLimit }
	};
}
const requestSignal = (signal, timeoutMs) => {
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
};
/**
* Read quota through the same refreshable OAuth lifecycle used by model turns.
* The browser receives only a parsed quota projection; bearer and account id
* are request-local host values. Concurrent settings polls share one request.
*/
function createCodexUsageReader(options) {
	const getAuth = options.getAuth;
	const readCredential = options.readCredential;
	const fetchUsage = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	let cached;
	let inFlight;
	const load = async (signal) => {
		const auth = await getAuth({ signal });
		const credential = await readCredential({ signal });
		const access = auth?.auth?.apiKey;
		const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
		if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("ChatGPT subscription is not signed in");
		const response = await fetchUsage(CODEX_USAGE_URL, {
			method: "GET",
			redirect: "error",
			headers: {
				authorization: `Bearer ${access}`,
				"chatgpt-account-id": accountId,
				accept: "application/json",
				"cache-control": "no-store",
				"user-agent": "@wsl043/dsh-codex-subscription"
			},
			signal: requestSignal(signal, timeoutMs)
		});
		if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "ChatGPT sign-in needs to be renewed" : `ChatGPT usage request failed (HTTP ${response.status})`);
		let value;
		try {
			value = await response.json();
		} catch {
			throw new Error("ChatGPT returned an unreadable usage response");
		}
		return {
			...parseCodexUsage(value),
			fetchedAt: now()
		};
	};
	return Object.freeze({
		read({ force = false, signal } = {}) {
			if (!force && cached !== void 0 && now() - cached.fetchedAt < ttlMs) return Promise.resolve(structuredClone(cached));
			if (inFlight !== void 0) return inFlight.then(structuredClone);
			const current = load(signal).then((value) => {
				cached = structuredClone(value);
				return structuredClone(value);
			}).finally(() => {
				if (inFlight === current) inFlight = void 0;
			});
			inFlight = current;
			return current;
		},
		clear() {
			cached = void 0;
		}
	});
}
//#endregion
//#region src/index.js
const name = "wsl043-codex-subscription";
const inject = [
	"llm",
	"credentials",
	"connection",
	"wsl043CodexBoundary"
];
const PROVIDER = "openai-codex";
const CREDENTIAL_REF = credentialRef("WSL043_OPENAI_CODEX_OAUTH");
const CHANNEL = "/wsl043-codex-subscription";
var CodexAdapter = class extends PiAiAdapter {
	constructor(options, telemetry) {
		super(options);
		this.telemetry = telemetry;
	}
	providerRetryPolicy() {}
	async *stream(options) {
		this.telemetry.begin(options);
		let usage;
		try {
			for await (const chunk of super.stream(options)) {
				if (chunk.type === "usage") usage = chunk.usage;
				yield chunk;
			}
		} finally {
			const sessionId = options.sessionId === void 0 ? void 0 : String(options.sessionId);
			this.telemetry.finish(options, usage, sessionId === void 0 ? void 0 : getOpenAICodexWebSocketDebugStats(sessionId));
		}
	}
};
const publicError = (code, message) => ({
	ok: false,
	error: {
		code,
		message,
		details: { issues: [] }
	}
});
function createSubscriptionRpcHandler({ authHandler, usageReader, telemetry }) {
	return async (endpoint, payload, signal) => {
		if (endpoint === "cache") {
			signal.throwIfAborted();
			return {
				ok: true,
				value: telemetry.snapshot()
			};
		}
		if (endpoint === "usage") try {
			signal.throwIfAborted();
			return {
				ok: true,
				value: await usageReader.read({
					force: payload?.force === true,
					signal
				})
			};
		} catch (error) {
			if (signal.aborted) throw error;
			const known = /* @__PURE__ */ new Set(["ChatGPT subscription is not signed in", "ChatGPT sign-in needs to be renewed"]);
			const message = error instanceof Error && known.has(error.message) ? error.message : "Could not read ChatGPT usage";
			return publicError("usage-unavailable", message);
		}
		const result = await authHandler(endpoint, payload, signal);
		if (endpoint === "logout" && result.ok === true) usageReader.clear();
		return result;
	};
}
function apply(ctx) {
	const policy = ctx.wsl043CodexBoundary?.resolve(PROVIDER) ?? ctx.get?.("wsl043CodexBoundary")?.resolve(PROVIDER);
	if (policy?.fallback !== "none" || policy?.auth !== "oauth") throw new Error("Codex route refused an inconsistent provider boundary");
	const telemetry = new CodexCacheTelemetry();
	const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF);
	const provider = openaiCodexProvider();
	const authModels = createModels({ credentials: store });
	authModels.setProvider(provider);
	const profile = Object.freeze({
		provider: PROVIDER,
		displayName: "ChatGPT subscription",
		piProvider: provider,
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		streamIdleTimeoutMs: 600 * 1e3,
		cacheRetention: "short",
		transport: "auto"
	});
	const profiles = /* @__PURE__ */ new Map([[PROVIDER, profile]]);
	const resolveAuth = () => authModels.getAuth(PROVIDER);
	const adapter = new CodexAdapter({
		profiles: () => profiles,
		resolveApiKey: async () => {
			let resolved;
			try {
				resolved = await resolveAuth();
			} catch {
				throw new LlmError("ChatGPT subscription authorization failed", "AUTH_FAILED");
			}
			if (typeof resolved?.auth.apiKey !== "string" || resolved.auth.apiKey.length === 0) throw new LlmError("ChatGPT subscription is not signed in", "MISSING_CREDENTIAL");
			return resolved.auth.apiKey;
		},
		resolveAttachments: () => ctx.get?.("attachments")
	}, telemetry);
	ctx.llm.registerAdapter([PROVIDER], adapter);
	const auth = createCodexAuthService(authModels, store);
	const coordinator = new CodexLoginCoordinator(auth);
	const usageReader = createCodexUsageReader({
		getAuth: resolveAuth,
		readCredential: (options) => store.read(PROVIDER, options)
	});
	const handler = createSubscriptionRpcHandler({
		authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
		usageReader,
		telemetry
	});
	ctx.provide("wsl043CodexCacheTelemetry", telemetry);
	ctx.provide("wsl043CodexAuth", auth);
	ctx.effect(() => ctx.connection.rpc.handle(CHANNEL, handler, { authority: "loopback" }), "wsl043-codex-subscription: loopback account RPC");
}
//#endregion
export { CODEX_USAGE_URL, CodexCacheTelemetry, CodexLoginCoordinator, DshOAuthCredentialStore, apply, assertCodexAuthUrl, commandForCodexAuthUrl, createCodexAuthService, createCodexRpcHandler, createCodexUsageReader, createSubscriptionRpcHandler, inject, name, openCodexAuthUrl, parseCodexUsage, prefixFingerprint };
