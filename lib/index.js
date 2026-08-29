import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { LlmError, createUserMessage } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { execFile, spawn } from "node:child_process";
import { request } from "node:https";
import { AsyncLocalStorage } from "node:async_hooks";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { HttpsProxyAgent } from "https-proxy-agent";
import { openaiCodexProvider as createOpenAICodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { createModels } from "@earendil-works/pi-ai";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { WebError } from "@deepseek-ai/dsh-web";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
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
function parseOAuthCredential(value) {
	try {
		return assertOAuthCredential(JSON.parse(value));
	} catch (error) {
		if (error?.message === "Codex credential store received a malformed OAuth credential") throw error;
		throw new Error("Codex credential store contains malformed OAuth JSON", { cause: error });
	}
}
/**
* Adapt DSH's managed string credential service to pi-ai's typed OAuth store.
* Refresh/login/logout operations are serialized so an older refresh response
* cannot overwrite a newer rotated token.
*/
var DshOAuthCredentialStore = class {
	#chains = /* @__PURE__ */ new Map();
	constructor(credentials, ref, legacyRefs = []) {
		if (credentials === void 0 || credentials === null) throw new Error("Codex OAuth requires the DSH credentials service");
		this.credentials = credentials;
		this.ref = ref;
		this.legacyRefs = Object.freeze([...legacyRefs]);
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
	async #read(providerId, options) {
		assertProvider(providerId);
		abortIfNeeded(options);
		let hit = await this.credentials.resolve(this.ref);
		if (hit?.value === void 0 || hit.value === "") for (const legacyRef of this.legacyRefs) {
			const legacy = await this.credentials.resolve(legacyRef);
			if (legacy?.value === void 0 || legacy.value === "") continue;
			const migrated = parseOAuthCredential(legacy.value);
			await this.credentials.set(this.ref, JSON.stringify(migrated));
			await this.credentials.unset(legacyRef);
			hit = { value: JSON.stringify(migrated) };
			break;
		}
		abortIfNeeded(options);
		if (hit?.value === void 0 || hit.value === "") return void 0;
		return parseOAuthCredential(hit.value);
	}
	read(providerId, options) {
		return this.#enqueue(providerId, () => this.#read(providerId, options), options);
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
			const current = await this.#read(providerId, options);
			const next = await update(clone(current));
			abortIfNeeded(options);
			if (next === void 0) return current;
			const validated = assertOAuthCredential(next);
			await this.credentials.set(this.ref, JSON.stringify(validated));
			for (const legacyRef of this.legacyRefs) await this.credentials.unset(legacyRef);
			abortIfNeeded(options);
			return clone(validated);
		}, options);
	}
	delete(providerId, options) {
		return this.#enqueue(providerId, async () => {
			await this.credentials.unset(this.ref);
			for (const legacyRef of this.legacyRefs) await this.credentials.unset(legacyRef);
			abortIfNeeded(options);
		}, options);
	}
};
/** Return only account state that is safe to expose to the browser client. */
function createCodexAuthService(models, store, options = {}) {
	const runLogin = options.runLogin ?? ((run) => run());
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
			return runLogin(() => models.login(PROVIDER$1, "oauth", interaction));
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
function classifyLoginFailure(error) {
	const message = error instanceof Error ? error.message : "";
	if (/token exchange failed/iu.test(message)) return "token-exchange";
	if (/fetch failed|\b(?:ECONN|ENOTFOUND|ETIMEDOUT|CERT_|socket|network)\b/iu.test(message)) return "network";
	if (/extract accountId|account[_ -]?id/iu.test(message)) return "account-claim";
	if (/credential|credentials-local|OAuth JSON/iu.test(message)) return "credential-store";
	if (/Missing authorization code|State mismatch|callback/iu.test(message)) return "callback";
	return "provider";
}
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
	supportState() {
		const active = this.#activeId === void 0 ? void 0 : this.#sessions.get(this.#activeId);
		if (active === void 0) return { phase: "idle" };
		return {
			method: active.view.method,
			phase: active.view.phase,
			...active.view.phase === "failed" ? { failure: classifyLoginFailure(active.hostError) } : {}
		};
	}
	async start({ method }) {
		if (!LOGIN_METHODS.has(method)) throw new Error(`unsupported Codex login method: ${String(method)}`);
		const active = this.#activeId === void 0 ? void 0 : this.#sessions.get(this.#activeId);
		if (active !== void 0 && !TERMINAL_PHASES.has(active.view.phase)) {
			active.view = {
				id: active.view.id,
				provider: "openai-codex",
				method: active.view.method,
				phase: "cancelled",
				authenticated: false
			};
			active.controller.abort(/* @__PURE__ */ new Error("Codex login replaced by a new attempt"));
		}
		if (active !== void 0) this.#sessions.delete(active.view.id);
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
		const publishReady = () => ready.resolve(publicClone(session.view));
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
		}).catch(async (error) => {
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
			try {
				const status = await this.auth.status();
				if (status.authenticated === true) {
					session.view = {
						id,
						provider: "openai-codex",
						method,
						phase: "authenticated",
						authenticated: true,
						...typeof status.expiresAt === "number" ? { expiresAt: status.expiresAt } : {}
					};
					return;
				}
			} catch {}
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
//#region src/oauth-network.js
const execFileAsync = promisify(execFile);
const CODEX_AUTH_HOST = "auth.openai.com";
const CODEX_HOSTS = /* @__PURE__ */ new Set([CODEX_AUTH_HOST, "chatgpt.com"]);
const networkScope = new AsyncLocalStorage();
let activeScopes = 0;
let baseFetch;
let scopedFetch;
function normalizeProxy(raw) {
	if (typeof raw !== "string" || raw.trim() === "") return void 0;
	const value = raw.trim().includes("://") ? raw.trim() : `http://${raw.trim()}`;
	try {
		const url = new URL(value);
		if (!["http:", "https:"].includes(url.protocol) || url.hostname === "") return void 0;
		return url.toString();
	} catch {
		return;
	}
}
function bypassesProxy(hostname, port, rawNoProxy) {
	if (typeof rawNoProxy !== "string" || rawNoProxy.trim() === "") return false;
	return rawNoProxy.split(/[\s,]+/u).some((raw) => {
		const entry = raw.trim().toLowerCase();
		if (entry === "*") return true;
		if (entry === "") return false;
		const match = /^(.*?)(?::(\d+))?$/u.exec(entry);
		const host = match?.[1]?.replace(/^\./u, "");
		const entryPort = match?.[2];
		if (!host || entryPort && entryPort !== port) return false;
		return hostname === host || hostname.endsWith(`.${host}`);
	});
}
function proxyFromEnvironment(env = process.env, target = new URL(`https://${CODEX_AUTH_HOST}/`)) {
	if (bypassesProxy(target.hostname.toLowerCase(), target.port || "443", env.NO_PROXY ?? env.no_proxy)) return void 0;
	return normalizeProxy(env.HTTPS_PROXY ?? env.https_proxy ?? env.ALL_PROXY ?? env.all_proxy);
}
function selectWindowsProxy(value) {
	if (typeof value !== "string") return void 0;
	const entries = value.split(";").map((item) => item.trim()).filter(Boolean);
	const https = entries.find((item) => /^https=/iu.test(item));
	const http = entries.find((item) => /^http=/iu.test(item));
	const selected = (https ?? http ?? entries.find((item) => !item.includes("=")))?.replace(/^[^=]+=/u, "");
	return normalizeProxy(selected);
}
async function windowsSystemProxy(options = {}) {
	const run = options.execFile ?? execFileAsync;
	const reg = `${process.env.SystemRoot ?? "C:\\Windows"}\\System32\\reg.exe`;
	const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
	try {
		const enabled = await run(reg, [
			"query",
			key,
			"/v",
			"ProxyEnable"
		], {
			windowsHide: true,
			encoding: "utf8"
		});
		if (!/REG_DWORD\s+0x1\b/iu.test(enabled.stdout)) return void 0;
		const configured = await run(reg, [
			"query",
			key,
			"/v",
			"ProxyServer"
		], {
			windowsHide: true,
			encoding: "utf8"
		});
		return selectWindowsProxy(/^\s*ProxyServer\s+REG_\w+\s+(.+)$/imu.exec(configured.stdout)?.[1]);
	} catch {
		return;
	}
}
async function macSystemProxy(options = {}) {
	const run = options.execFile ?? execFileAsync;
	try {
		const result = await run("/usr/sbin/scutil", ["--proxy"], { encoding: "utf8" });
		if (!/^\s*HTTPSEnable\s*:\s*1\s*$/imu.test(result.stdout)) return void 0;
		const host = /^\s*HTTPSProxy\s*:\s*(\S+)\s*$/imu.exec(result.stdout)?.[1];
		const port = /^\s*HTTPSPort\s*:\s*(\d+)\s*$/imu.exec(result.stdout)?.[1];
		return normalizeProxy(host && port ? `${host}:${port}` : void 0);
	} catch {
		return;
	}
}
async function resolveCodexProxy(options = {}) {
	const target = options.target ?? new URL(`https://${CODEX_AUTH_HOST}/`);
	const env = options.env ?? process.env;
	if (bypassesProxy(target.hostname.toLowerCase(), target.port || "443", env.NO_PROXY ?? env.no_proxy)) return {
		url: void 0,
		source: "bypass"
	};
	const envProxy = proxyFromEnvironment(env, target);
	if (envProxy) return {
		url: envProxy,
		source: "environment"
	};
	const platform = options.platform ?? process.platform;
	const system = platform === "win32" ? await windowsSystemProxy(options) : platform === "darwin" ? await macSystemProxy(options) : void 0;
	return system ? {
		url: system,
		source: "system"
	} : {
		url: void 0,
		source: "direct"
	};
}
function bodyBytes(body) {
	if (body === void 0 || body === null) return void 0;
	if (typeof body === "string") return Buffer.from(body);
	if (body instanceof URLSearchParams) return Buffer.from(body.toString());
	if (body instanceof Uint8Array) return Buffer.from(body);
	throw new TypeError("Unsupported Codex OAuth request body");
}
function fetchThroughProxy(input, init, proxyUrl) {
	const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
	const body = bodyBytes(init?.body);
	const headers = new Headers(init?.headers);
	if (body && !headers.has("content-length")) headers.set("content-length", String(body.byteLength));
	return new Promise((resolve, reject) => {
		const request$1 = request(target, {
			method: init?.method ?? "GET",
			headers: Object.fromEntries(headers.entries()),
			agent: new HttpsProxyAgent(proxyUrl),
			signal: init?.signal
		}, (response) => {
			const responseHeaders = new Headers();
			for (const [name, value] of Object.entries(response.headers)) if (Array.isArray(value)) value.forEach((item) => responseHeaders.append(name, item));
			else if (value !== void 0) responseHeaders.set(name, value);
			const status = response.statusCode ?? 500;
			const empty = init?.method === "HEAD" || [
				204,
				205,
				304
			].includes(status);
			resolve(new Response(empty ? null : Readable.toWeb(response), {
				status,
				statusText: response.statusMessage,
				headers: responseHeaders
			}));
		});
		request$1.on("error", reject);
		if (body) request$1.write(body);
		request$1.end();
	});
}
async function withCodexNetwork(run, options = {}) {
	if (activeScopes === 0) {
		baseFetch = globalThis.fetch;
		scopedFetch = async (input, init) => {
			const scope = networkScope.getStore();
			if (scope === void 0) return baseFetch(input, init);
			const { options: scopedOptions, allowedHosts, resolved } = scope;
			const proxyFetch = scopedOptions.fetchThroughProxy ?? fetchThroughProxy;
			const target = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
			if (target.protocol !== "https:" || !allowedHosts.has(target.hostname)) return baseFetch(input, init);
			let proxy = resolved.get(target.hostname);
			if (proxy === void 0) {
				proxy = resolveCodexProxy({
					...scopedOptions,
					target
				});
				resolved.set(target.hostname, proxy);
			}
			const route = await proxy;
			scopedOptions.onRoute?.(route.source);
			return route.url === void 0 ? baseFetch(input, init) : proxyFetch(input, init, route.url);
		};
		globalThis.fetch = scopedFetch;
	}
	activeScopes += 1;
	const scope = {
		options,
		allowedHosts: options.hosts ?? CODEX_HOSTS,
		resolved: /* @__PURE__ */ new Map()
	};
	try {
		return await networkScope.run(scope, run);
	} finally {
		activeScopes -= 1;
		if (activeScopes === 0) {
			if (globalThis.fetch === scopedFetch) globalThis.fetch = baseFetch;
			baseFetch = void 0;
			scopedFetch = void 0;
		}
	}
}
function classifyTransportError(error) {
	const name = error?.name;
	const code = String(error?.code ?? error?.cause?.code ?? "");
	if (name === "AbortError" || name === "TimeoutError" || /ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT/u.test(code)) return "timeout";
	if (/ENOTFOUND|EAI_AGAIN/u.test(code)) return "dns";
	if (/CERT_|TLS|SSL/u.test(code)) return "tls";
	if (/ECONN|EPIPE|UND_ERR_SOCKET/u.test(code)) return "connection";
	return "network";
}
const elapsedBucket = (elapsed) => elapsed < 1e3 ? "under-1s" : elapsed < 5e3 ? "1-5s" : elapsed < 15e3 ? "5-15s" : "over-15s";
function createCodexNetworkTransport(options = {}) {
	const attempts = /* @__PURE__ */ new Map();
	const now = options.now ?? Date.now;
	const run = async (area, operation) => {
		const startedAt = now();
		let route = attempts.get(area)?.route ?? "direct";
		let routed = false;
		try {
			const value = await withCodexNetwork(operation, {
				...options,
				onRoute: (source) => {
					route = source;
					routed = true;
				}
			});
			if (value instanceof Response && !value.ok) attempts.set(area, {
				status: "failed",
				stage: "http",
				code: "http-error",
				httpStatus: value.status,
				route,
				elapsed: elapsedBucket(now() - startedAt)
			});
			else if (routed || value instanceof Response) attempts.set(area, {
				status: "ok",
				route,
				elapsed: elapsedBucket(now() - startedAt)
			});
			return value;
		} catch (error) {
			if (routed) attempts.set(area, {
				status: "failed",
				stage: "transport",
				code: classifyTransportError(error),
				route,
				elapsed: elapsedBucket(now() - startedAt)
			});
			throw error;
		}
	};
	return Object.freeze({
		run,
		fetch: (area, input, init) => run(area, () => globalThis.fetch(input, init)),
		snapshot: () => Object.fromEntries([...attempts].map(([area, value]) => [area, { ...value }]))
	});
}
//#endregion
//#region src/settings-contract.js
const SETTINGS_NAMESPACE = "codex-subscription";
const QUICK_QUOTA_MODE_FIELD = "quickQuotaMode";
const LEGACY_QUICK_QUOTA_FIELD = "quickQuotaVisible";
const QUICK_QUOTA_MODE_PERCENT = "percent";
const QUICK_QUOTA_MODE_FORECAST = "forecast";
const SEARCH_PROVIDER_FIELD = "searchProvider";
const SEARCH_PROVIDER_AUTO = "auto";
const SEARCH_PROVIDER_CODEX = "codex";
const DEFAULT_SEARCH_PROVIDER = SEARCH_PROVIDER_AUTO;
const SPEED_MODE_FIELD = "speedMode";
const SPEED_MODE_STANDARD = "standard";
const SPEED_MODE_FAST = "fast";
const DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD;
const OUTPUT_VERBOSITY_FIELD = "outputVerbosity";
const OUTPUT_VERBOSITY_DEFAULT = "default";
const OUTPUT_VERBOSITY_MEDIUM = "medium";
const OUTPUT_VERBOSITY_HIGH = "high";
const DEFAULT_OUTPUT_VERBOSITY = OUTPUT_VERBOSITY_DEFAULT;
const CONTEXT_MODE_FIELD = "contextMode";
const CONTEXT_MODE_STANDARD = "standard";
const CONTEXT_MODE_EXTENDED = "extended";
const CONTEXT_MODE_CUSTOM = "custom";
const DEFAULT_CONTEXT_MODE = CONTEXT_MODE_STANDARD;
const CUSTOM_CONTEXT_WINDOW_FIELD = "customContextWindow";
const DEFAULT_CUSTOM_CONTEXT_WINDOW = 272e3;
const MIN_CUSTOM_CONTEXT_WINDOW = 128e3;
const MAX_CUSTOM_CONTEXT_WINDOW = 1e6;
const CUSTOM_CONTEXT_MODEL_FIELDS = Object.freeze({
	"gpt-5.4": "customContextGpt54",
	"gpt-5.4-mini": "customContextGpt54Mini",
	"gpt-5.5": "customContextGpt55",
	"gpt-5.6": "customContextGpt56"
});
const CUSTOM_CONTEXT_MODEL_CAPS = Object.freeze({
	"gpt-5.4": 1e6,
	"gpt-5.4-mini": 4e5,
	"gpt-5.5": 1e6,
	"gpt-5.6": 1e6
});
const CUSTOM_CONTEXT_MODEL_DEFAULTS = Object.freeze({
	"gpt-5.4": 272e3,
	"gpt-5.4-mini": 272e3,
	"gpt-5.5": 272e3,
	"gpt-5.6": 272e3
});
const normalizeOutputVerbosity = (value) => [
	"default",
	"low",
	"medium",
	"high"
].includes(value) ? value : DEFAULT_OUTPUT_VERBOSITY;
const normalizeContextMode = (value) => [
	"standard",
	"extended",
	"custom"
].includes(value) ? value : DEFAULT_CONTEXT_MODE;
const normalizeCustomContextWindow = (value, maximum = MAX_CUSTOM_CONTEXT_WINDOW) => {
	if (!Number.isInteger(value)) return DEFAULT_CUSTOM_CONTEXT_WINDOW;
	return Math.min(Math.max(value, MIN_CUSTOM_CONTEXT_WINDOW), maximum);
};
const customContextModelKey = (modelId) => modelId?.startsWith("gpt-5.6-") ? "gpt-5.6" : modelId;
function contextModelGroups(models) {
	const groups = /* @__PURE__ */ new Map();
	for (const model of models ?? []) {
		if (model?.id === "gpt-5.3-codex-spark") {
			groups.set(model.id, {
				key: model.id,
				label: model.name ?? model.id,
				maximum: 128e3,
				fixed: true
			});
			continue;
		}
		const key = customContextModelKey(model?.id);
		if (!Object.hasOwn(CUSTOM_CONTEXT_MODEL_FIELDS, key)) continue;
		if (key !== "gpt-5.6") {
			groups.set(key, {
				key,
				label: model.name ?? model.id,
				maximum: CUSTOM_CONTEXT_MODEL_CAPS[key]
			});
			continue;
		}
		const variant = String(model.name ?? model.id).replace(/^GPT-5\.6[ -]/iu, "");
		const current = groups.get(key);
		groups.set(key, {
			key,
			label: `GPT-5.6 ${current === void 0 ? variant : `${current.label.replace(/^GPT-5\.6 /u, "")} / ${variant}`}`,
			maximum: CUSTOM_CONTEXT_MODEL_CAPS[key]
		});
	}
	return [...groups.values()];
}
const normalizeQuickQuotaMode = (value, legacyVisible = false) => [
	"off",
	"percent",
	"bar",
	"forecast"
].includes(value) ? value : legacyVisible === true ? QUICK_QUOTA_MODE_PERCENT : "off";
const supportsCodexFastMode = (modelId) => typeof modelId === "string" && (/^gpt-5\.(?:5|6)(?:$|-)/u.test(modelId) || modelId === "gpt-5.4");
//#endregion
//#region src/pi-ai-runtime.js
const FAST_SERVICE_TIER = "priority";
/**
* Preserve pi-ai's native Codex OAuth provider while allowing DSH's generic
* PiAiAdapter to pass the access token resolved by the host credential store.
*
* PiAiAdapter owns a request-local Models collection backed by the same DSH
* credential store as this provider. A pure OAuth provider ignores its
* `apiKey` request override and otherwise fails before dispatch with "Provider
* is not configured". This non-interactive bridge teaches that collection how
* to consume only the already-refreshed token for this request; login, refresh,
* persistence, headers, transport, and model behavior remain owned by the
* original provider.
*/
const EXTENDED_CONTEXT_WINDOWS = Object.freeze({
	"gpt-5.4": 1e6,
	"gpt-5.4-mini": 4e5,
	"gpt-5.5": 1e6,
	"gpt-5.6-luna": 1e6,
	"gpt-5.6-sol": 1e6,
	"gpt-5.6-terra": 1e6
});
function openaiCodexSubscriptionProvider({ resolveSpeedMode = () => void 0, resolveOutputVerbosity = () => OUTPUT_VERBOSITY_DEFAULT, resolveContextMode = () => void 0, resolveCustomContextWindow = () => void 0, catalog, runNetwork = (_area, operation) => operation() } = {}) {
	const provider = createOpenAICodexProvider();
	const requestToken = Object.freeze({
		name: "DSH-managed Codex OAuth request token",
		async resolve({ credential }) {
			const token = credential?.type === "api_key" ? credential.key : void 0;
			if (typeof token !== "string" || token.length === 0) return void 0;
			return {
				auth: { apiKey: token },
				source: "DSH-managed OAuth request"
			};
		}
	});
	const modelMetadata = (model) => catalog?.metadata(model?.id);
	const supportsVerbosity = (model) => modelMetadata(model)?.supportVerbosity ?? model?.id !== "gpt-5.3-codex-spark";
	const withPreferences = (model, options = {}) => {
		const metadata = modelMetadata(model);
		const requestedVerbosity = resolveOutputVerbosity();
		const textVerbosity = supportsVerbosity(model) ? requestedVerbosity === "default" ? metadata?.defaultVerbosity ?? "medium" : requestedVerbosity : void 0;
		const fast = resolveSpeedMode() === "fast" && (metadata?.supportsFast ?? supportsCodexFastMode(model?.id));
		const onPayload = options.onPayload;
		return {
			...options,
			...textVerbosity === void 0 ? {} : { textVerbosity },
			...fast ? { serviceTier: FAST_SERVICE_TIER } : {},
			async onPayload(payload, requestModel) {
				const preferred = {
					...payload,
					...textVerbosity === void 0 ? {} : { text: {
						...payload.text ?? {},
						verbosity: textVerbosity
					} },
					...fast ? { service_tier: FAST_SERVICE_TIER } : {}
				};
				const next = await onPayload?.(preferred, requestModel);
				return {
					...next ?? preferred,
					...textVerbosity === void 0 ? {} : { text: {
						...(next ?? preferred).text ?? {},
						verbosity: textVerbosity
					} },
					...fast ? { service_tier: FAST_SERVICE_TIER } : {}
				};
			}
		};
	};
	const getModels = () => (catalog?.getModels(provider.getModels()) ?? provider.getModels()).map((model) => {
		const maximum = EXTENDED_CONTEXT_WINDOWS[model.id];
		const mode = resolveContextMode();
		if (maximum === void 0 || !["extended", "custom"].includes(mode)) return model;
		if (mode === "extended") return {
			...model,
			contextWindow: Math.max(model.contextWindow, maximum)
		};
		const requested = normalizeCustomContextWindow(resolveCustomContextWindow(customContextModelKey(model.id)), maximum);
		return {
			...model,
			contextWindow: requested
		};
	});
	const networkIterable = (factory) => {
		let iterator;
		const getIterator = () => iterator ??= factory()[Symbol.asyncIterator]();
		return {
			[Symbol.asyncIterator]() {
				return this;
			},
			next: (value) => runNetwork("model", () => getIterator().next(value)),
			return: (value) => runNetwork("model", () => getIterator().return?.(value) ?? Promise.resolve({
				done: true,
				value
			})),
			throw: (error) => runNetwork("model", () => getIterator().throw?.(error) ?? Promise.reject(error))
		};
	};
	return Object.freeze({
		...provider,
		auth: Object.freeze({
			...provider.auth,
			apiKey: requestToken
		}),
		getModels,
		stream: (model, context, options) => networkIterable(() => provider.stream(model, context, withPreferences(model, options))),
		streamSimple: (model, context, options) => networkIterable(() => provider.streamSimple(model, context, withPreferences(model, options)))
	});
}
//#endregion
//#region src/version.js
const PACKAGE_VERSION = "1.11.1";
const USER_AGENT = `dsh-codex-subscription/${PACKAGE_VERSION}`;
//#endregion
//#region src/model-catalog.js
const CODEX_MODELS_URL = `https://chatgpt.com/backend-api/codex/models?client_version=${encodeURIComponent(PACKAGE_VERSION)}`;
const LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
const record$4 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty$2 = (value) => typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
const positiveInteger$1 = (value) => Number.isSafeInteger(value) && value > 0 ? value : void 0;
function reasoningMap(levels) {
	const supported = new Set((Array.isArray(levels) ? levels : []).map((level) => nonEmpty$2(record$4(level) ? level.effort : void 0)).filter(Boolean));
	const map = Object.fromEntries(LEVELS.map((level) => [level, null]));
	if (supported.has("none")) map.off = "none";
	for (const level of LEVELS.slice(1)) if (supported.has(level)) map[level] = level;
	return map;
}
function visibleModel(value) {
	if (!record$4(value)) return void 0;
	const id = nonEmpty$2(value.slug);
	if (id === void 0 || value.supported_in_api !== true || value.visibility !== "list") return void 0;
	const supported = Array.isArray(value.supported_reasoning_levels) ? value.supported_reasoning_levels : [];
	const input = Array.isArray(value.input_modalities) ? value.input_modalities.filter((item) => ["text", "image"].includes(item)) : ["text", "image"];
	return {
		id,
		name: nonEmpty$2(value.display_name) ?? id,
		description: nonEmpty$2(value.description),
		priority: Number.isFinite(value.priority) ? value.priority : 0,
		input: input.length > 0 ? input : ["text"],
		contextWindow: positiveInteger$1(value.context_window) ?? positiveInteger$1(value.max_context_window),
		reasoning: supported.length > 0,
		thinkingLevelMap: reasoningMap(supported),
		supportVerbosity: value.support_verbosity === true,
		defaultVerbosity: [
			"low",
			"medium",
			"high"
		].includes(value.default_verbosity) ? value.default_verbosity : void 0,
		supportsFast: [...Array.isArray(value.additional_speed_tiers) ? value.additional_speed_tiers : [], ...Array.isArray(value.service_tiers) ? value.service_tiers.map((tier) => tier?.id) : []].some((tier) => tier === "fast" || tier === "priority")
	};
}
function parseOfficialModelCatalog(value) {
	if (!record$4(value) || !Array.isArray(value.models)) throw new Error("Codex returned a malformed model catalog");
	const seen = /* @__PURE__ */ new Set();
	return value.models.map(visibleModel).filter((model) => model !== void 0 && !seen.has(model.id) && seen.add(model.id)).sort((left, right) => right.priority - left.priority);
}
function mergeModel(baseModels, remote) {
	const base = baseModels.find((model) => model.id === remote.id) ?? baseModels.find((model) => model.id !== "gpt-5.3-codex-spark") ?? baseModels[0];
	if (base === void 0) return void 0;
	return {
		...base,
		id: remote.id,
		name: remote.name,
		input: remote.input,
		reasoning: remote.reasoning,
		thinkingLevelMap: remote.thinkingLevelMap,
		...remote.contextWindow === void 0 ? {} : { contextWindow: remote.contextWindow },
		...base.id === remote.id ? {} : { cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0
		} }
	};
}
function createOfficialModelCatalog(options = {}) {
	const fetchCatalog = options.fetch ?? fetch;
	let models;
	let metadata = /* @__PURE__ */ new Map();
	let etag;
	let revision = 0;
	let refreshing;
	const refresh = async ({ signal } = {}) => {
		if (refreshing !== void 0) return refreshing;
		refreshing = (async () => {
			const auth = await options.getAuth({ signal });
			const credential = await options.readCredential({ signal });
			const access = auth?.auth?.apiKey;
			const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
			if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) return false;
			const headers = {
				authorization: `Bearer ${access}`,
				"chatgpt-account-id": accountId,
				accept: "application/json",
				originator: "pi",
				"user-agent": USER_AGENT,
				...etag === void 0 ? {} : { "if-none-match": etag }
			};
			const response = await fetchCatalog(CODEX_MODELS_URL, {
				method: "GET",
				redirect: "error",
				headers,
				signal
			});
			if (response.status === 304) return false;
			if (!response.ok) throw new Error(`Codex model catalog failed (HTTP ${response.status})`);
			const remote = parseOfficialModelCatalog(await response.json());
			if (remote.length === 0) throw new Error("Codex returned an empty model catalog");
			const baseModels = options.baseModels();
			const next = remote.map((model) => mergeModel(baseModels, model)).filter(Boolean);
			if (next.length === 0) throw new Error("Codex model catalog has no compatible models");
			models = next;
			metadata = new Map(remote.map((model) => [model.id, model]));
			etag = nonEmpty$2(response.headers.get("etag")) ?? etag;
			revision += 1;
			return true;
		})().finally(() => {
			refreshing = void 0;
		});
		return refreshing;
	};
	return Object.freeze({
		refresh,
		getModels: (fallback) => models ?? fallback,
		metadata: (modelId) => metadata.get(modelId),
		revision: () => revision,
		clear() {
			models = void 0;
			metadata = /* @__PURE__ */ new Map();
			etag = void 0;
			revision += 1;
		}
	});
}
//#endregion
//#region src/codex-search.js
const CODEX_SEARCH_PROVIDER_ID = "codex-subscription";
const CODEX_AUTO_SEARCH_PROVIDER_ID = "codex-subscription-auto";
const CODEX_SEARCH_URL = "https://chatgpt.com/backend-api/codex/alpha/search";
const DEFAULT_MODEL = "gpt-5.6-luna";
const MAX_OUTPUT_TOKENS = 4096;
const MAX_SOURCE_DATE = 64;
const record$3 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty$1 = (value) => typeof value === "string" && value.length > 0 ? value : void 0;
const displayText = (value) => {
	const text = nonEmpty$1(value)?.replace(/\s+/gu, " ").trim();
	if (text === void 0 || text.length === 0) return void 0;
	return text;
};
const boundedDisplayText = (value, maximum) => {
	const text = displayText(value);
	if (text === void 0 || text.length <= maximum) return text;
	return `${text.slice(0, maximum - 1)}…`;
};
function sourceOf(value) {
	if (!record$3(value)) return void 0;
	const url = nonEmpty$1(value.url);
	if (url === void 0) return void 0;
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return void 0;
	const title = displayText(value.title) ?? parsed.hostname;
	const snippet = displayText(value.snippet);
	const publishedAt = boundedDisplayText(value.published_at, MAX_SOURCE_DATE) ?? boundedDisplayText(value.publishedAt, MAX_SOURCE_DATE);
	return {
		url,
		title,
		...snippet === void 0 ? {} : { snippet },
		...publishedAt === void 0 ? {} : { publishedAt }
	};
}
function parseSearchResponse(value) {
	if (!record$3(value) || !Array.isArray(value.results)) throw new Error("Codex returned a malformed search response");
	const seen = /* @__PURE__ */ new Set();
	const sources = [];
	for (const result of value.results ?? []) {
		const source = sourceOf(result);
		if (source === void 0 || seen.has(source.url)) continue;
		seen.add(source.url);
		sources.push(source);
	}
	return {
		sources,
		truncated: false
	};
}
/** Create the DSH web provider backed only by the ChatGPT subscription search endpoint. */
function createCodexSearchProvider(options) {
	const fetchSearch = options.fetch ?? fetch;
	return Object.freeze({
		id: CODEX_SEARCH_PROVIDER_ID,
		available: () => true,
		async search(request, signal) {
			const auth = await options.getAuth({ signal });
			const credential = await options.readCredential({ signal });
			const access = auth?.auth?.apiKey;
			const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
			if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new WebError("ChatGPT subscription is not signed in", "WEB_PROVIDER_CREDENTIAL_MISSING");
			const model = nonEmpty$1(options.resolveModel?.()) ?? DEFAULT_MODEL;
			const id = nonEmpty$1(options.resolveSessionId?.()) ?? randomUUID();
			let response;
			try {
				response = await fetchSearch(CODEX_SEARCH_URL, {
					method: "POST",
					redirect: "error",
					headers: {
						authorization: `Bearer ${access}`,
						"chatgpt-account-id": accountId,
						accept: "application/json",
						"content-type": "application/json",
						originator: "pi",
						"user-agent": USER_AGENT
					},
					body: JSON.stringify({
						id,
						model,
						input: request.query,
						commands: {
							search_query: [{ q: request.query }],
							response_length: "short"
						},
						settings: {
							allowed_callers: ["direct"],
							external_web_access: true
						},
						max_output_tokens: MAX_OUTPUT_TOKENS
					}),
					signal
				});
			} catch (error) {
				if (signal?.aborted || error?.name === "AbortError") throw new WebError("Codex search aborted", "WEB_ABORTED", { cause: error });
				throw new WebError("Codex search request failed", "WEB_PROVIDER_ERROR", { cause: error });
			}
			if (!response.ok) throw response.status === 401 || response.status === 403 ? new WebError("ChatGPT sign-in needs to be renewed", "WEB_PROVIDER_CREDENTIAL_MISSING") : new WebError(`Codex search request failed (HTTP ${response.status})`, "WEB_PROVIDER_ERROR");
			let value;
			try {
				value = await response.json();
			} catch (error) {
				throw new WebError("Codex returned an unreadable search response", "WEB_PROVIDER_ERROR", { cause: error });
			}
			try {
				return parseSearchResponse(value);
			} catch (error) {
				throw new WebError("Codex returned a malformed search response", "WEB_PROVIDER_ERROR", { cause: error });
			}
		}
	});
}
/** Route each request by its initiating model without changing the user's explicit overrides. */
function createCodexAutoSearchProvider(options) {
	return Object.freeze({
		id: CODEX_AUTO_SEARCH_PROVIDER_ID,
		available: () => true,
		async search(request, signal) {
			if (options.resolveModelProvider?.() === "openai-codex") return options.codex.search(request, signal);
			const provider = options.resolveDshProvider?.();
			if (provider === void 0 || provider.id === "codex-subscription-auto" || provider.id === "codex-subscription" || provider.available() !== true) throw new WebError("DSH default search is unavailable", "WEB_PROVIDER_UNAVAILABLE");
			return provider.search(request, signal);
		}
	});
}
const ORIGINAL_IMAGE_CHUNK_BYTES = 4 * 1024 * 1024;
const ORIGINAL_IMAGE_ID_PATTERN = /^img_[0-9a-f]{32}$/u;
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
function decodeOriginalImageRef(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || typeof value.assetId !== "string" || !ORIGINAL_IMAGE_ID_PATTERN.test(value.assetId) || value.mediaType !== "image/png" || !positiveInteger(value.bytes) || value.bytes > 48 * 1024 * 1024 || !positiveInteger(value.width) || !positiveInteger(value.height) || typeof value.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.name) || typeof value.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.sha256)) return void 0;
	return {
		assetId: value.assetId,
		mediaType: value.mediaType,
		bytes: value.bytes,
		width: value.width,
		height: value.height,
		name: value.name,
		sha256: value.sha256
	};
}
function decodeImagePresentation(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value) || value.kind !== "codex-subscription-image" || value.schemaVersion !== 1) return void 0;
	const original = decodeOriginalImageRef(value.original);
	return original === void 0 ? void 0 : { original };
}
function originalImageRefsEqual(left, right) {
	const a = decodeOriginalImageRef(left);
	const b = decodeOriginalImageRef(right);
	return a !== void 0 && b !== void 0 && a.assetId === b.assetId && a.mediaType === b.mediaType && a.bytes === b.bytes && a.width === b.width && a.height === b.height && a.name === b.name && a.sha256 === b.sha256;
}
/** Resolve only an exact original reference copied into a DSH fork prefix. */
function inheritedOriginalImageRef(session, assetId) {
	const parentSession = session?.header?.parentSession;
	const seedLength = session?.header?.seedLength;
	if (typeof parentSession !== "string" || parentSession.length === 0 || !Number.isSafeInteger(seedLength) || seedLength < 0 || !Array.isArray(session?.events) || !ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) return void 0;
	for (const event of session.events) {
		if (!Number.isSafeInteger(event?.seq) || event.seq < 0 || event.seq >= seedLength || event.type !== "tool/result") continue;
		const original = decodeImagePresentation(event.data?.meta)?.original;
		if (original?.assetId === assetId) return original;
	}
}
//#endregion
//#region src/codex-images.js
const CODEX_IMAGE_TOOL_NAME = "codex_image_generate";
const CODEX_IMAGE_GENERATION_URL = "https://chatgpt.com/backend-api/codex/images/generations";
const CODEX_IMAGE_EDIT_URL = "https://chatgpt.com/backend-api/codex/images/edits";
const IMAGE_MODEL = "gpt-image-2";
const MAX_REFERENCE_IMAGES = 5;
const RESPONSE_ENVELOPE_BYTES = 1024 * 1024;
const IMAGE_QUALITIES = /* @__PURE__ */ new Set([
	"auto",
	"low",
	"medium",
	"high"
]);
const IMAGE_BACKGROUNDS = /* @__PURE__ */ new Set([
	"auto",
	"transparent",
	"opaque"
]);
const PNG_SIGNATURE = Buffer.from([
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
]);
const record$2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0 ? value.trim() : void 0;
function normalizeImageOptions(args) {
	const quality = nonEmpty(args?.quality) ?? "auto";
	const background = nonEmpty(args?.background) ?? "auto";
	const size = nonEmpty(args?.size) ?? "auto";
	if (!IMAGE_QUALITIES.has(quality)) throw new Error("quality must be auto, low, medium, or high");
	if (!IMAGE_BACKGROUNDS.has(background)) throw new Error("background must be auto, transparent, or opaque");
	if (size !== "auto") {
		const match = /^(\d+)x(\d+)$/u.exec(size);
		const width = Number(match?.[1]);
		const height = Number(match?.[2]);
		const short = Math.min(width, height);
		const long = Math.max(width, height);
		const pixels = width * height;
		if (match === null || width % 16 !== 0 || height % 16 !== 0 || long > 3840 || long > short * 3 || pixels < 655360 || pixels > 8294400) throw new Error("size must be auto or a valid GPT Image 2 widthxheight resolution");
	}
	return {
		quality,
		background,
		size
	};
}
function encodedLimit(decodedBytes) {
	return Math.ceil(decodedBytes / 3) * 4;
}
function validBase64Body(value, end) {
	for (let index = 0; index < end; index += 1) {
		const code = value.charCodeAt(index);
		if (!(code >= 65 && code <= 90 || code >= 97 && code <= 122 || code >= 48 && code <= 57 || code === 43 || code === 47)) return false;
	}
	return true;
}
async function readJsonWithin(response, maximumBytes) {
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new Error("Codex image response exceeds the image size limit");
	if (response.body === null) throw new Error("Codex returned an unreadable image response");
	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		bytes += value.byteLength;
		if (bytes > maximumBytes) {
			await reader.cancel();
			throw new Error("Codex image response exceeds the image size limit");
		}
		chunks.push(value);
	}
	const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes).toString("utf8");
	try {
		return JSON.parse(body);
	} catch {
		throw new Error("Codex returned an unreadable image response");
	}
}
/** Strictly decode one PNG returned by the subscription backend. */
function decodeCodexPng(value, maximumBytes) {
	const encoded = nonEmpty(value);
	const padding = encoded?.endsWith("==") ? 2 : encoded?.endsWith("=") ? 1 : 0;
	if (encoded === void 0 || encoded.length % 4 !== 0 || !validBase64Body(encoded, encoded.length - padding)) throw new Error("Codex returned an invalid base64 PNG");
	const decodedBytes = encoded.length / 4 * 3 - padding;
	if (decodedBytes > maximumBytes) throw new Error("Codex image exceeds the image size limit");
	const data = Buffer.from(encoded, "base64");
	if (data.length !== decodedBytes || data.length < PNG_SIGNATURE.length || !data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error("Codex returned an invalid PNG");
	return new Uint8Array(data);
}
function imageReference(value) {
	return {
		attachmentId: value.attachmentId,
		mediaType: value.mediaType,
		bytes: value.bytes,
		width: value.width,
		height: value.height,
		...value.name === void 0 ? {} : { name: value.name }
	};
}
function referenceOf(value, attachments) {
	if (!record$2(value) || typeof value.attachmentId !== "string" || value.attachmentId.length === 0 || value.attachmentId.length > 256 || !attachments.imageLimits.mediaTypes.includes(value.mediaType) || !Number.isSafeInteger(value.bytes) || value.bytes <= 0 || !Number.isSafeInteger(value.width) || value.width <= 0 || !Number.isSafeInteger(value.height) || value.height <= 0 || value.name !== void 0 && (typeof value.name !== "string" || value.name.length > 256)) throw new Error("referenceImages contains an invalid image reference");
	return imageReference(value);
}
async function editImages(values, attachments, signal) {
	if (!Array.isArray(values) || values.length === 0 || values.length > MAX_REFERENCE_IMAGES) throw new Error(`referenceImages must contain between 1 and ${MAX_REFERENCE_IMAGES} images`);
	const references = values.map((value) => referenceOf(value, attachments));
	if (new Set(references.map((value) => value.attachmentId)).size !== references.length) throw new Error("referenceImages must not contain duplicates");
	const images = [];
	let totalBytes = 0;
	for (const reference of references) {
		const stored = await attachments.readImage(reference, signal);
		totalBytes += stored.data.byteLength;
		if (totalBytes > attachments.imageLimits.maxMessageImageBytes) throw new Error("referenceImages exceed the DSH message image limit");
		images.push({ image_url: `data:${stored.ref.mediaType};base64,${Buffer.from(stored.data).toString("base64")}` });
	}
	return images;
}
function imageContent(value) {
	return [{
		type: "text",
		text: typeof value.size === "string" && value.size.length > 0 ? `Generated a ${value.size} image.` : "Generated an image."
	}, {
		type: "image",
		attachment: imageReference(value.image)
	}];
}
function imageOutputSchema() {
	return {
		type: "object",
		additionalProperties: false,
		properties: {
			image: {
				type: "object",
				required: true,
				additionalProperties: false,
				properties: {
					attachmentId: {
						type: "string",
						required: true
					},
					mediaType: {
						type: "string",
						enum: ["image/png"],
						required: true
					},
					bytes: {
						type: "integer",
						required: true
					},
					width: {
						type: "integer",
						required: true
					},
					height: {
						type: "integer",
						required: true
					},
					name: { type: "string" }
				}
			},
			original: {
				type: "object",
				required: true,
				additionalProperties: false,
				properties: {
					assetId: {
						type: "string",
						required: true
					},
					mediaType: {
						type: "string",
						enum: ["image/png"],
						required: true
					},
					bytes: {
						type: "integer",
						required: true
					},
					width: {
						type: "integer",
						required: true
					},
					height: {
						type: "integer",
						required: true
					},
					name: {
						type: "string",
						required: true
					},
					sha256: {
						type: "string",
						required: true
					}
				}
			},
			background: { type: "string" },
			quality: { type: "string" },
			size: { type: "string" }
		}
	};
}
function responseMetadata(value) {
	const data = Array.isArray(value?.data) ? value.data[0] : void 0;
	const encoded = record$2(data) ? data.b64_json : void 0;
	if (typeof encoded !== "string") throw new Error("Codex returned no image data");
	return {
		encoded,
		background: nonEmpty(value.background),
		quality: nonEmpty(value.quality),
		size: nonEmpty(value.size)
	};
}
/** Create the DSH-native image-generation tool backed only by the ChatGPT subscription. */
function createCodexImageTool(options) {
	const fetchImage = options.fetch ?? fetch;
	const attachments = options.attachments;
	return defineTool({
		name: CODEX_IMAGE_TOOL_NAME,
		description: "Create a new image or explicitly edit selected prior images using the signed-in Codex subscription. Omit referenceImages for a completely new image. Include only the exact prior image references the user asked to edit; never assume every image in the conversation is a reference.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "A complete, production-ready description of the image to generate."
			},
			size: {
				type: "string",
				description: "Optional GPT Image 2 output size. Use auto unless the user requests an exact valid widthxheight resolution."
			},
			quality: {
				type: "string",
				enum: [
					"auto",
					"low",
					"medium",
					"high"
				],
				description: "Optional rendering quality. Use auto unless the user requests draft speed or final quality."
			},
			background: {
				type: "string",
				enum: [
					"auto",
					"transparent",
					"opaque"
				],
				description: "Optional background mode. Request transparent only when the user needs transparency."
			},
			referenceImages: {
				type: "array",
				description: "Optional explicit references to 1-5 prior images to edit. Omit for a new image.",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						attachmentId: {
							type: "string",
							required: true
						},
						mediaType: {
							type: "string",
							required: true
						},
						bytes: {
							type: "integer",
							required: true
						},
						width: {
							type: "integer",
							required: true
						},
						height: {
							type: "integer",
							required: true
						},
						name: { type: "string" }
					}
				}
			}
		},
		output: {
			schema: imageOutputSchema(),
			render: (_args, value) => imageContent(value),
			presentationMeta: (_args, value) => ({
				kind: "codex-subscription-image",
				schemaVersion: 1,
				original: value.original
			})
		},
		timeoutMs: 300 * 1e3,
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const prompt = nonEmpty(args.prompt);
			if (prompt === void 0) throw new Error("prompt must be a non-empty string");
			const imageOptions = normalizeImageOptions(args);
			const auth = await options.getAuth({ signal: exec.signal });
			const credential = await options.readCredential({ signal: exec.signal });
			const access = auth?.auth?.apiKey;
			const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
			if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("ChatGPT subscription is not signed in");
			if (!attachments.imageLimits.mediaTypes.includes("image/png")) throw new Error("This DSH installation does not accept PNG image attachments");
			const maximumBytes = Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes);
			const editing = args.referenceImages !== void 0;
			const images = editing ? await editImages(args.referenceImages, attachments, exec.signal) : void 0;
			let response;
			try {
				response = await fetchImage(editing ? CODEX_IMAGE_EDIT_URL : CODEX_IMAGE_GENERATION_URL, {
					method: "POST",
					redirect: "error",
					headers: {
						authorization: `Bearer ${access}`,
						"chatgpt-account-id": accountId,
						accept: "application/json",
						"content-type": "application/json",
						originator: "pi",
						"x-codex-image-turn-id": String(exec.callId),
						"user-agent": USER_AGENT
					},
					body: JSON.stringify({
						...images === void 0 ? {} : { images },
						prompt,
						background: imageOptions.background,
						model: IMAGE_MODEL,
						quality: imageOptions.quality,
						size: imageOptions.size
					}),
					signal: exec.signal
				});
			} catch (error) {
				if (exec.signal.aborted) throw exec.signal.reason;
				throw new Error(`Codex image ${editing ? "edit" : "generation"} request failed`, { cause: error });
			}
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) throw new Error("ChatGPT sign-in needs to be renewed");
				if (response.status === 429) throw new Error("Codex image generation quota is unavailable");
				throw new Error(`Codex image ${editing ? "edit" : "generation"} failed (HTTP ${response.status})`);
			}
			const metadata = responseMetadata(await readJsonWithin(response, encodedLimit(maximumBytes) + RESPONSE_ENVELOPE_BYTES));
			const data = decodeCodexPng(metadata.encoded, maximumBytes);
			const sessionId = exec.agent?.id;
			if (sessionId === void 0) throw new Error("Codex image generation requires a session-owned tool call");
			const original = await options.originalImages.save(String(sessionId), data);
			let ref;
			try {
				ref = await attachments.saveImage({
					data,
					mediaType: "image/png",
					name: "codex-generated.png"
				});
			} catch (error) {
				await options.originalImages.remove(original);
				throw error;
			}
			const result = {
				image: imageReference(ref),
				original,
				...metadata.background === void 0 ? {} : { background: metadata.background },
				...metadata.quality === void 0 ? {} : { quality: metadata.quality },
				...metadata.size === void 0 ? {} : { size: metadata.size }
			};
			if (exec.parent !== void 0) exec.deferContext(createUserMessage({
				content: imageContent(result),
				source: {
					kind: "plugin",
					plugin: "codex-subscription"
				}
			}));
			return result;
		}
	});
}
//#endregion
//#region src/image-original-store.js
const ORIGINAL_IMAGE_DIRECTORY = "dsh-codex-subscription/images/v1";
const METADATA_VERSION = 1;
const digest = (data) => createHash("sha256").update(data).digest("hex");
const validSessionId = (value) => typeof value === "string" && value.length > 0 && value.length <= 512;
function pngDimensions(data) {
	if (!(data instanceof Uint8Array) || data.byteLength < 24 || Buffer.from(data.subarray(0, 8)).toString("hex") !== "89504e470d0a1a0a" || Buffer.from(data.subarray(12, 16)).toString("ascii") !== "IHDR") throw new TypeError("invalid PNG dimensions");
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const width = view.getUint32(16, false);
	const height = view.getUint32(20, false);
	if (width === 0 || height === 0) throw new TypeError("invalid PNG dimensions");
	return {
		width,
		height
	};
}
async function writeExclusive(filename, data) {
	await mkdir(dirname(filename), {
		recursive: true,
		mode: 448
	});
	const handle = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 384);
	try {
		await handle.writeFile(data);
		await handle.sync();
	} finally {
		await handle.close();
	}
}
async function assertPrivateFile(filename) {
	const stat = await lstat(filename);
	if (!stat.isFile()) throw new Error("not a regular file");
	if (process.platform !== "win32" && (stat.mode & 63) !== 0) throw new Error("file is not owner-only");
}
function parseMetadata(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return;
	}
	if (value?.version !== METADATA_VERSION || !validSessionId(value.sessionId)) return void 0;
	const image = decodeOriginalImageRef(value.image);
	return image === void 0 ? void 0 : {
		sessionId: value.sessionId,
		image
	};
}
var OriginalImageStore = class {
	constructor(dshHome) {
		this.root = resolve(join(resolveDshHome(dshHome), ORIGINAL_IMAGE_DIRECTORY));
	}
	directory(assetId) {
		if (!ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) throw new TypeError("invalid original image asset id");
		return join(this.root, assetId.slice(4, 6), assetId);
	}
	async save(sessionId, data, name = "codex-generated-original.png") {
		if (!validSessionId(sessionId) || !(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > 48 * 1024 * 1024) throw new TypeError("invalid original image input");
		const { width, height } = pngDimensions(data);
		const assetId = `img_${randomBytes(16).toString("hex")}`;
		const directory = this.directory(assetId);
		const ref = {
			assetId,
			mediaType: "image/png",
			bytes: data.byteLength,
			width,
			height,
			name,
			sha256: digest(data)
		};
		try {
			await mkdir(dirname(directory), {
				recursive: true,
				mode: 448
			});
			await mkdir(directory, {
				recursive: false,
				mode: 448
			});
			await writeExclusive(join(directory, "original"), data);
			const temporary = join(directory, `metadata.${randomBytes(8).toString("hex")}.tmp`);
			await writeExclusive(temporary, Buffer.from(`${JSON.stringify({
				version: METADATA_VERSION,
				sessionId,
				image: ref
			}, null, 2)}\n`));
			await rename(temporary, join(directory, "metadata.json"));
			return ref;
		} catch (error) {
			await rm(directory, {
				recursive: true,
				force: true
			}).catch(() => void 0);
			throw error;
		}
	}
	async remove(ref) {
		if (ref !== void 0 && ORIGINAL_IMAGE_ID_PATTERN.test(ref.assetId)) await rm(this.directory(ref.assetId), {
			recursive: true,
			force: true
		}).catch(() => void 0);
	}
	async read(sessionId, assetId, inherited) {
		if (!validSessionId(sessionId) || !ORIGINAL_IMAGE_ID_PATTERN.test(assetId)) return void 0;
		try {
			const directory = this.directory(assetId);
			const metadataFile = join(directory, "metadata.json");
			const originalFile = join(directory, "original");
			await Promise.all([assertPrivateFile(metadataFile), assertPrivateFile(originalFile)]);
			const metadata = parseMetadata(await readFile(metadataFile, "utf8"));
			if (metadata === void 0 || metadata.image.assetId !== assetId || metadata.sessionId !== sessionId && !originalImageRefsEqual(metadata.image, inherited)) return void 0;
			const data = new Uint8Array(await readFile(originalFile));
			const dimensions = pngDimensions(data);
			if (data.byteLength !== metadata.image.bytes || digest(data) !== metadata.image.sha256 || dimensions.width !== metadata.image.width || dimensions.height !== metadata.image.height) return void 0;
			return {
				ref: metadata.image,
				data
			};
		} catch {
			return;
		}
	}
	async chunk(sessionId, assetId, offset, inherited) {
		if (!Number.isSafeInteger(offset) || offset < 0) return void 0;
		const stored = await this.read(sessionId, assetId, inherited);
		if (stored === void 0 || offset >= stored.data.byteLength || offset % 4194304 !== 0) return void 0;
		const end = Math.min(stored.data.byteLength, offset + ORIGINAL_IMAGE_CHUNK_BYTES);
		return {
			ref: stored.ref,
			offset,
			encoded: Buffer.from(stored.data.subarray(offset, end)).toString("base64"),
			done: end === stored.data.byteLength
		};
	}
};
//#endregion
//#region src/diagnostics.js
const requestAreas = /* @__PURE__ */ new Set([
	"login",
	"model",
	"quota",
	"quota-reset",
	"search",
	"image"
]);
const statuses = /* @__PURE__ */ new Set(["ok", "failed"]);
const stages = /* @__PURE__ */ new Set(["transport", "http"]);
const codes = /* @__PURE__ */ new Set([
	"timeout",
	"dns",
	"tls",
	"connection",
	"network",
	"http-error"
]);
const routes = /* @__PURE__ */ new Set([
	"direct",
	"environment",
	"system",
	"bypass"
]);
const elapsedBuckets = /* @__PURE__ */ new Set([
	"under-1s",
	"1-5s",
	"5-15s",
	"over-15s"
]);
function safeRequests(network) {
	const raw = network?.snapshot?.() ?? {};
	const result = {};
	for (const [area, value] of Object.entries(raw)) {
		if (!requestAreas.has(area) || value === null || typeof value !== "object") continue;
		if (!statuses.has(value.status) || !routes.has(value.route) || !elapsedBuckets.has(value.elapsed)) continue;
		result[area] = {
			status: value.status,
			...stages.has(value.stage) ? { stage: value.stage } : {},
			...codes.has(value.code) ? { code: value.code } : {},
			...Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599 ? { httpStatus: value.httpStatus } : {},
			route: value.route,
			elapsed: value.elapsed
		};
	}
	return result;
}
/** Build a support report that deliberately excludes OAuth and account metadata. */
async function createSubscriptionDiagnostics({ auth, preferences, login = { phase: "idle" }, network }) {
	let account = { status: "unknown" };
	const issues = [];
	try {
		account = { status: (await auth.status()).authenticated === true ? "signed-in" : "signed-out" };
	} catch {
		issues.push({ code: "account-status-unavailable" });
	}
	const preference = preferences.status();
	return {
		schemaVersion: 3,
		package: "dsh-codex-subscription",
		version: PACKAGE_VERSION,
		runtime: {
			node: process.version,
			platform: process.platform,
			arch: process.arch
		},
		account,
		login,
		requests: safeRequests(network),
		configuration: {
			contextMode: preference.contextMode,
			quickQuotaMode: preference.quickQuotaMode,
			...typeof preference.outputVerbosity === "string" ? { outputVerbosity: preference.outputVerbosity } : {},
			searchProvider: preference.searchProvider,
			speedMode: preference.speedMode,
			writable: preference.writable === true
		},
		issues
	};
}
//#endregion
//#region src/usage.js
const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const DEFAULT_TTL_MS = 6e4;
const DEFAULT_TIMEOUT_MS$1 = 15e3;
const record$1 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function windowOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record$1(value)) throw new Error("Codex returned a malformed rate-limit window");
	const used = value.used_percent;
	const seconds = value.limit_window_seconds;
	if (!Number.isFinite(used) || used < 0 || used > 100) throw new Error("Codex returned an invalid used percentage");
	if (!Number.isInteger(seconds) || seconds <= 0) throw new Error("Codex returned an invalid window duration");
	const resetsAt = epochSeconds(value.reset_at, "rate-limit reset time");
	return {
		usedPercent: used,
		remainingPercent: 100 - used,
		windowSeconds: seconds,
		...resetsAt === void 0 ? {} : { resetsAt }
	};
}
function limitOf(id, name, value) {
	if (value === void 0 || value === null) return void 0;
	if (!record$1(value)) throw new Error("Codex returned malformed rate-limit details");
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
function epochSeconds(value, label) {
	if (value === void 0 || value === null || value === 0) return void 0;
	if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Codex returned an invalid ${label}`);
	return value;
}
function creditsOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record$1(value) || typeof value.has_credits !== "boolean" || typeof value.unlimited !== "boolean") throw new Error("Codex returned malformed credit details");
	if (!value.has_credits) return void 0;
	return {
		unlimited: value.unlimited,
		...value.balance === void 0 || value.balance === null ? {} : { balance: decimal(value.balance, "credit balance") }
	};
}
function individualOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record$1(value)) throw new Error("Codex returned malformed spend control");
	const item = value.individual_limit;
	if (item === void 0 || item === null) return void 0;
	if (!record$1(item) || !Number.isFinite(item.remaining_percent) || item.remaining_percent < 0 || item.remaining_percent > 100) throw new Error("Codex returned an invalid individual-limit percentage");
	const resetsAt = epochSeconds(item.reset_at, "individual-limit reset time");
	return {
		limit: decimal(item.limit, "individual limit"),
		used: decimal(item.used, "individual usage"),
		remainingPercent: item.remaining_percent,
		...resetsAt === void 0 ? {} : { resetsAt }
	};
}
function spendControlReachedOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record$1(value)) throw new Error("Codex returned malformed spend control");
	if (value.reached === void 0 || value.reached === null) return void 0;
	if (typeof value.reached !== "boolean") throw new Error("Codex returned an invalid spend-control state");
	return value.reached;
}
function resetCreditsOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (!record$1(value) || !Number.isSafeInteger(value.available_count) || value.available_count < 0) throw new Error("Codex returned malformed reset credit details");
	if (value.credits !== void 0 && value.credits !== null && !Array.isArray(value.credits)) throw new Error("Codex returned malformed reset credit details");
	const expirations = (value.credits ?? []).filter((credit) => record$1(credit) && credit.status?.toLowerCase?.() === "available").map((credit) => {
		if (Number.isSafeInteger(credit.expires_at) && credit.expires_at > 0) return credit.expires_at * 1e3;
		if (typeof credit.expires_at === "string" && credit.expires_at.length <= 64) {
			const parsed = Date.parse(credit.expires_at);
			if (Number.isFinite(parsed) && parsed > 0) return parsed;
		}
	}).filter((expiration) => expiration !== void 0);
	return {
		availableCount: value.available_count,
		...expirations.length === 0 ? {} : { nextExpiresAt: Math.min(...expirations) }
	};
}
/** Reduce the provider payload to a browser-safe quota projection. */
function parseCodexUsage(value) {
	if (!record$1(value)) throw new Error("Codex returned a malformed usage response");
	const rateLimits = [];
	const seenLimitIds = /* @__PURE__ */ new Set();
	const addLimit = (limit) => {
		if (limit === void 0 || seenLimitIds.has(limit.id)) return;
		seenLimitIds.add(limit.id);
		rateLimits.push(limit);
	};
	addLimit(limitOf("codex", "Codex", value.rate_limit));
	if (value.additional_rate_limits !== void 0 && value.additional_rate_limits !== null && !Array.isArray(value.additional_rate_limits)) throw new Error("Codex returned malformed additional rate limits");
	for (const entry of value.additional_rate_limits ?? []) {
		if (!record$1(entry) || typeof entry.metered_feature !== "string" || entry.metered_feature.length === 0) throw new Error("Codex returned a malformed additional rate limit");
		if (entry.limit_name !== void 0 && entry.limit_name !== null && typeof entry.limit_name !== "string") throw new Error("Codex returned an invalid additional rate-limit name");
		addLimit(limitOf(entry.metered_feature, entry.limit_name || void 0, entry.rate_limit));
	}
	addLimit(limitOf("code_review", "Code review", value.code_review_rate_limit));
	const credits = creditsOf(value.credits);
	const individualLimit = individualOf(value.spend_control);
	const spendControlReached = spendControlReachedOf(value.spend_control);
	const resetCredits = resetCreditsOf(value.rate_limit_reset_credits);
	return {
		rateLimits,
		...credits === void 0 ? {} : { credits },
		...individualLimit === void 0 ? {} : { individualLimit },
		...spendControlReached === void 0 ? {} : { spendControlReached },
		...resetCredits === void 0 ? {} : { resetCredits }
	};
}
const requestSignal$1 = (signal, timeoutMs) => {
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
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS$1;
	let cached;
	let inFlight;
	let generation = 0;
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
				"user-agent": USER_AGENT
			},
			signal: requestSignal$1(signal, timeoutMs)
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
			const currentGeneration = generation;
			const current = load(signal).then((value) => {
				if (generation === currentGeneration) cached = structuredClone(value);
				return structuredClone(value);
			}).finally(() => {
				if (inFlight === current) inFlight = void 0;
			});
			inFlight = current;
			return current;
		},
		clear() {
			generation += 1;
			cached = void 0;
			inFlight = void 0;
		}
	});
}
//#endregion
//#region src/quota-forecast.js
const HOUR_MS = 3600 * 1e3;
const HISTORY_MS = 24 * HOUR_MS;
const MIN_SPAN_MS = 1800 * 1e3;
const MIN_CONSUMED_PERCENT = 1;
const PLATEAU_SAMPLE_MS = 900 * 1e3;
const finite = (value) => Number.isFinite(Number(value));
const clampPercent = (value) => Math.max(0, Math.min(100, Number(value)));
const keyFor = (window) => `codex:${Number(window.windowSeconds) || "limit"}`;
function observeQuotaForecast(state, windows, now = Date.now()) {
	const next = { windows: { ...state?.windows ?? {} } };
	let changed = false;
	for (const window of windows ?? []) {
		if (!finite(window?.remainingPercent)) continue;
		const key = keyFor(window);
		const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null;
		const remainingPercent = Math.round(clampPercent(window.remainingPercent) * 1e4) / 1e4;
		const previous = next.windows[key];
		const resetChanged = previous !== void 0 && (previous.resetsAt === null !== (resetsAt === null) || previous.resetsAt !== null && Math.abs(previous.resetsAt - resetsAt) > 300);
		const last = previous?.samples?.at(-1);
		const quotaIncreased = last !== void 0 && remainingPercent > last.remainingPercent + .5;
		const record = resetChanged || quotaIncreased ? {
			resetsAt,
			samples: []
		} : {
			resetsAt,
			samples: [...previous?.samples ?? []]
		};
		const latest = record.samples.at(-1);
		if (latest === void 0 || now > latest.at && (Math.abs(remainingPercent - latest.remainingPercent) >= .001 || now - latest.at >= PLATEAU_SAMPLE_MS)) {
			record.samples.push({
				at: now,
				remainingPercent
			});
			record.samples = record.samples.filter((sample) => sample.at >= now - HISTORY_MS).slice(-192);
			changed = true;
		}
		next.windows[key] = record;
	}
	return {
		state: next,
		changed
	};
}
function estimateQuotaForecast(state, window, now = Date.now()) {
	if (!finite(window?.remainingPercent)) return { status: "calibrating" };
	const record = state?.windows?.[keyFor(window)];
	if (record === void 0) return { status: "calibrating" };
	const resetsAt = finite(window.resetsAt) ? Number(window.resetsAt) : null;
	if (record.resetsAt === null !== (resetsAt === null) || resetsAt !== null && Math.abs(record.resetsAt - resetsAt) > 300) return { status: "calibrating" };
	const samples = record.samples.filter((sample) => sample.at >= now - HISTORY_MS && sample.at <= now + 6e4);
	if (samples.length < 3) return {
		status: "calibrating",
		sampleCount: samples.length
	};
	const first = samples[0];
	const last = samples.at(-1);
	const spanMs = last.at - first.at;
	const consumedPercent = Math.max(0, first.remainingPercent - last.remainingPercent);
	if (spanMs < MIN_SPAN_MS || consumedPercent < MIN_CONSUMED_PERCENT) return {
		status: "calibrating",
		sampleCount: samples.length,
		observedSpanMs: spanMs,
		consumedPercent
	};
	const firstAt = first.at;
	const weighted = samples.map((sample) => ({
		x: (sample.at - firstAt) / HOUR_MS,
		y: first.remainingPercent - sample.remainingPercent,
		weight: Math.exp((sample.at - last.at) / (6 * HOUR_MS))
	}));
	const totalWeight = weighted.reduce((sum, point) => sum + point.weight, 0);
	const meanX = weighted.reduce((sum, point) => sum + point.x * point.weight, 0) / totalWeight;
	const meanY = weighted.reduce((sum, point) => sum + point.y * point.weight, 0) / totalWeight;
	const numerator = weighted.reduce((sum, point) => sum + point.weight * (point.x - meanX) * (point.y - meanY), 0);
	const denominator = weighted.reduce((sum, point) => sum + point.weight * (point.x - meanX) ** 2, 0);
	const pacePerHour = denominator > 0 ? numerator / denominator : 0;
	if (!Number.isFinite(pacePerHour) || pacePerHour < .02) return {
		status: "idle",
		pacePerHour: 0
	};
	const runwaySeconds = clampPercent(window.remainingPercent) / pacePerHour * 3600;
	const resetSeconds = resetsAt === null ? null : Math.max(0, resetsAt - now / 1e3);
	return {
		status: "ready",
		pacePerHour,
		runwaySeconds,
		survivesReset: resetSeconds !== null && runwaySeconds >= resetSeconds,
		sampleCount: samples.length,
		observedSpanMs: spanMs,
		consumedPercent
	};
}
function forecastUsage(usage, state = { windows: {} }, now = Date.now()) {
	const observed = observeQuotaForecast(state, usage?.rateLimits?.find((limit) => limit.id === "codex")?.windows ?? [], now);
	return {
		state: observed.state,
		changed: observed.changed,
		usage: {
			...usage,
			rateLimits: (usage?.rateLimits ?? []).map((limit) => limit.id !== "codex" ? limit : {
				...limit,
				windows: limit.windows.map((window) => ({
					...window,
					forecast: estimateQuotaForecast(observed.state, window, now)
				}))
			})
		}
	};
}
function createQuotaForecastReader({ reader, enabled, now = Date.now }) {
	let state = { windows: {} };
	return Object.freeze({
		async read(options) {
			const usage = await reader.read(options);
			if (!enabled()) {
				state = { windows: {} };
				return usage;
			}
			const forecast = forecastUsage(usage, state, now());
			state = forecast.state;
			return forecast.usage;
		},
		clear() {
			state = { windows: {} };
			reader.clear();
		}
	});
}
//#endregion
//#region src/reset-credits.js
const CODEX_RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const CODEX_RESET_CONSUME_URL = `${CODEX_RESET_CREDITS_URL}/consume`;
const DEFAULT_CONFIRM_DELAY_MS = 5e3;
const DEFAULT_CHALLENGE_TTL_MS = 6e4;
const DEFAULT_TIMEOUT_MS = 15e3;
const MAX_COPY_LENGTH = 240;
const UNCERTAIN_RESET_RESULT = "Quota reset result is uncertain; retry this confirmation to check the same request";
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const requestSignal = (signal, timeoutMs) => {
	const timeout = AbortSignal.timeout(timeoutMs);
	return signal === void 0 ? timeout : AbortSignal.any([signal, timeout]);
};
function safeCopy(value) {
	return typeof value === "string" && value.length > 0 ? value.slice(0, MAX_COPY_LENGTH) : void 0;
}
function credentialsOf(auth, credential) {
	const access = auth?.auth?.apiKey;
	const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
	if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("ChatGPT subscription is not signed in");
	return {
		access,
		accountId
	};
}
function expirationOf(value) {
	if (value === void 0 || value === null) return void 0;
	if (Number.isSafeInteger(value) && value > 0) return value * 1e3;
	if (typeof value === "string" && value.length > 0 && value.length <= 64) {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	throw new Error("ChatGPT returned malformed quota reset details");
}
function parseDetails(value, now) {
	if (!record(value) || !Number.isSafeInteger(value.available_count) || value.available_count < 0 || !Array.isArray(value.credits)) throw new Error("ChatGPT returned malformed quota reset details");
	if (value.available_count === 0) throw new Error("No quota reset is available");
	const available = value.credits.filter((credit) => record(credit) && typeof credit.id === "string" && credit.id.length > 0 && credit.id.length <= 256 && typeof credit.status === "string" && credit.status.toLowerCase() === "available").map((credit) => {
		return {
			credit,
			expiresAt: expirationOf(credit.expires_at)
		};
	}).filter(({ expiresAt }) => expiresAt === void 0 || expiresAt > now).sort((a, b) => (a.expiresAt ?? Number.MAX_SAFE_INTEGER) - (b.expiresAt ?? Number.MAX_SAFE_INTEGER));
	if (available.length === 0) throw new Error("No usable quota reset is available");
	return {
		availableCount: value.available_count,
		creditId: available[0].credit.id,
		title: safeCopy(available[0].credit.title),
		description: safeCopy(available[0].credit.description),
		creditExpiresAt: available[0].expiresAt
	};
}
function parseConsumeResult(value) {
	if (!record(value) || ![
		"reset",
		"nothing_to_reset",
		"no_credit",
		"already_redeemed"
	].includes(value.code)) throw new Error("ChatGPT returned an unreadable quota reset response");
	const windowsReset = Array.isArray(value.windows_reset) ? value.windows_reset.filter((item) => typeof item === "string").slice(0, 16) : [];
	const windowsResetCount = Number.isSafeInteger(value.windows_reset) && value.windows_reset >= 0 && value.windows_reset <= 16 ? value.windows_reset : void 0;
	return {
		code: value.code,
		windowsReset,
		...windowsResetCount === void 0 ? {} : { windowsResetCount }
	};
}
/**
* Host-only reset redemption. The browser receives an opaque, short-lived
* challenge; account ids, bearer tokens, credit ids, and idempotency keys stay
* in memory on the host.
*/
function createCodexResetCreditService(options) {
	const getAuth = options.getAuth;
	const readCredential = options.readCredential;
	const usageReader = options.usageReader;
	const fetchReset = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const randomUUID$1 = options.randomUUID ?? randomUUID;
	const confirmDelayMs = options.confirmDelayMs ?? DEFAULT_CONFIRM_DELAY_MS;
	const challengeTtlMs = options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const challenges = /* @__PURE__ */ new Map();
	const resolveCredentials = async (signal) => credentialsOf(await getAuth({ signal }), await readCredential({ signal }));
	const readDetails = async (signal, credentials) => {
		const { access, accountId } = credentials ?? await resolveCredentials(signal);
		const response = await fetchReset(CODEX_RESET_CREDITS_URL, {
			method: "GET",
			redirect: "error",
			headers: {
				authorization: `Bearer ${access}`,
				"chatgpt-account-id": accountId,
				accept: "application/json",
				"cache-control": "no-store",
				"user-agent": USER_AGENT
			},
			signal: requestSignal(signal, timeoutMs)
		});
		if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "ChatGPT sign-in needs to be renewed" : `ChatGPT quota reset request failed (HTTP ${response.status})`);
		let raw;
		try {
			raw = await response.json();
		} catch {
			throw new Error("ChatGPT returned unreadable quota reset details");
		}
		return {
			accountId,
			details: parseDetails(raw, now())
		};
	};
	return Object.freeze({
		async inspect({ signal } = {}) {
			const { details } = await readDetails(signal);
			return {
				availableCount: details.availableCount,
				...details.creditExpiresAt === void 0 ? {} : { nextExpiresAt: details.creditExpiresAt }
			};
		},
		async prepare({ signal } = {}) {
			const credentials = await resolveCredentials(signal);
			for (const [challengeId, challenge] of challenges) {
				if (challenge.accountId !== credentials.accountId || challenge.uncertain !== true) continue;
				if (now() > challenge.expiresAt) {
					challenges.delete(challengeId);
					continue;
				}
				return {
					challengeId,
					availableCount: challenge.availableCount,
					readyAt: challenge.readyAt,
					expiresAt: challenge.expiresAt,
					...challenge.creditExpiresAt === void 0 ? {} : { creditExpiresAt: challenge.creditExpiresAt },
					...challenge.title === void 0 ? {} : { title: challenge.title },
					...challenge.description === void 0 ? {} : { description: challenge.description }
				};
			}
			const { accountId, details } = await readDetails(signal, credentials);
			const preparedAt = now();
			const readyAt = preparedAt + confirmDelayMs;
			const expiresAt = Math.min(preparedAt + challengeTtlMs, details.creditExpiresAt ?? Number.MAX_SAFE_INTEGER);
			if (expiresAt <= readyAt) throw new Error("The available quota reset expires too soon");
			const challengeId = randomUUID$1();
			challenges.set(challengeId, {
				state: "prepared",
				accountId,
				creditId: details.creditId,
				redeemRequestId: randomUUID$1(),
				readyAt,
				expiresAt,
				availableCount: details.availableCount,
				creditExpiresAt: details.creditExpiresAt,
				title: details.title,
				description: details.description,
				uncertain: false
			});
			return {
				challengeId,
				availableCount: details.availableCount,
				readyAt,
				expiresAt,
				...details.creditExpiresAt === void 0 ? {} : { creditExpiresAt: details.creditExpiresAt },
				...details.title === void 0 ? {} : { title: details.title },
				...details.description === void 0 ? {} : { description: details.description }
			};
		},
		async consume({ challengeId, acknowledged, signal } = {}) {
			const challenge = typeof challengeId === "string" ? challenges.get(challengeId) : void 0;
			if (challenge === void 0) throw new Error("This quota reset confirmation is no longer valid");
			if (challenge.state === "pending") throw new Error("This quota reset is already in progress");
			if (now() < challenge.readyAt) throw new Error("Wait before confirming this quota reset");
			if (now() > challenge.expiresAt) {
				challenges.delete(challengeId);
				throw new Error("This quota reset confirmation is no longer valid");
			}
			if (acknowledged !== true) throw new Error("You must acknowledge that this may consume one quota reset");
			challenge.state = "pending";
			let retryable = challenge.uncertain === true;
			try {
				const { access, accountId } = await resolveCredentials(signal);
				if (accountId !== challenge.accountId) {
					retryable = false;
					throw new Error("The signed-in ChatGPT account changed");
				}
				let response;
				try {
					response = await fetchReset(CODEX_RESET_CONSUME_URL, {
						method: "POST",
						redirect: "error",
						headers: {
							authorization: `Bearer ${access}`,
							"chatgpt-account-id": accountId,
							accept: "application/json",
							"content-type": "application/json",
							"cache-control": "no-store",
							"user-agent": USER_AGENT
						},
						body: JSON.stringify({
							redeem_request_id: challenge.redeemRequestId,
							credit_id: challenge.creditId
						}),
						signal: requestSignal(signal, timeoutMs)
					});
				} catch {
					retryable = true;
					throw new Error(UNCERTAIN_RESET_RESULT);
				}
				if (!response.ok) {
					if (response.status >= 500) {
						retryable = true;
						throw new Error(UNCERTAIN_RESET_RESULT);
					}
					if (response.status !== 401 && response.status !== 403) retryable = false;
					throw new Error(response.status === 401 || response.status === 403 ? "ChatGPT sign-in needs to be renewed" : `ChatGPT quota reset request failed (HTTP ${response.status})`);
				}
				let raw;
				try {
					raw = await response.json();
				} catch {
					retryable = true;
					throw new Error(UNCERTAIN_RESET_RESULT);
				}
				let result;
				try {
					result = parseConsumeResult(raw);
				} catch {
					retryable = true;
					throw new Error(UNCERTAIN_RESET_RESULT);
				}
				retryable = false;
				usageReader.clear();
				return result;
			} finally {
				if (retryable && now() <= challenge.expiresAt) {
					challenge.state = "prepared";
					challenge.uncertain = true;
				} else challenges.delete(challengeId);
			}
		},
		clear() {
			challenges.clear();
		}
	});
}
//#endregion
//#region src/index.js
const name = "codex-subscription";
const inject = [
	"llm",
	"credentials",
	"connection",
	"settings",
	"web",
	"loader",
	"tools",
	"attachments"
];
const PROVIDER = "openai-codex";
const CREDENTIAL_REF = credentialRef("OPENAI_CODEX_SUBSCRIPTION_OAUTH");
const LEGACY_CREDENTIAL_REF = credentialRef("WSL043_OPENAI_CODEX_OAUTH");
const CHANNEL = "/codex-subscription";
const WEB_ENTRY_ID = "web";
const DSH_SEARCH_PROVIDER_FALLBACK = "deepseek-official";
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
const publicError = (code, message) => ({
	ok: false,
	error: {
		code,
		message,
		details: { issues: [] }
	}
});
function createSubscriptionRpcHandler({ authHandler, usageReader, resetCreditService, preferences, diagnosticsReader, modelCatalog, originalImages, resolveInheritedOriginal }) {
	return async (endpoint, payload, signal) => {
		if (endpoint === "image/original/chunk") try {
			signal.throwIfAborted();
			if (typeof payload?.sessionId !== "string" || payload.sessionId.length === 0 || payload.sessionId.length > 512 || typeof payload?.assetId !== "string" || !ORIGINAL_IMAGE_ID_PATTERN.test(payload.assetId) || !Number.isSafeInteger(payload?.offset) || payload.offset < 0 || payload.offset % 4194304 !== 0) return publicError("invalid-input", "Invalid original image request");
			const inherited = resolveInheritedOriginal?.(payload.sessionId, payload.assetId);
			const chunk = await originalImages?.chunk(payload.sessionId, payload.assetId, payload.offset, inherited);
			if (chunk === void 0) return publicError("not-found", "Original image is unavailable");
			return {
				ok: true,
				value: chunk
			};
		} catch (error) {
			if (signal.aborted) throw error;
			return publicError("internal", "Could not read the original image");
		}
		if (endpoint === "diagnostics") try {
			signal.throwIfAborted();
			return {
				ok: true,
				value: await diagnosticsReader()
			};
		} catch (error) {
			if (signal.aborted) throw error;
			return publicError("internal", "Could not create support diagnostics");
		}
		if (endpoint === "preferences/status" || endpoint === "preferences/update") try {
			signal.throwIfAborted();
			if (endpoint === "preferences/update") {
				const patch = {};
				if (Object.hasOwn(payload ?? {}, "quickQuotaMode")) {
					if (![
						"off",
						"percent",
						"bar",
						"forecast"
					].includes(payload["quickQuotaMode"])) return publicError("internal", "Invalid quick quota preference");
					patch[QUICK_QUOTA_MODE_FIELD] = payload[QUICK_QUOTA_MODE_FIELD];
				}
				if (Object.hasOwn(payload ?? {}, "searchProvider")) {
					if (![
						"auto",
						"dsh",
						"codex"
					].includes(payload["searchProvider"])) return publicError("internal", "Invalid search provider preference");
					patch[SEARCH_PROVIDER_FIELD] = payload[SEARCH_PROVIDER_FIELD];
				}
				if (Object.hasOwn(payload ?? {}, "speedMode")) {
					if (!["standard", "fast"].includes(payload["speedMode"])) return publicError("internal", "Invalid speed mode preference");
					patch[SPEED_MODE_FIELD] = payload[SPEED_MODE_FIELD];
				}
				if (Object.hasOwn(payload ?? {}, "outputVerbosity")) {
					if (![
						"default",
						"low",
						"medium",
						"high"
					].includes(payload["outputVerbosity"])) return publicError("internal", "Invalid output verbosity preference");
					patch[OUTPUT_VERBOSITY_FIELD] = payload[OUTPUT_VERBOSITY_FIELD];
				}
				if (Object.hasOwn(payload ?? {}, "contextMode")) {
					if (![
						"standard",
						"extended",
						"custom"
					].includes(payload["contextMode"])) return publicError("internal", "Invalid context mode preference");
					patch[CONTEXT_MODE_FIELD] = payload[CONTEXT_MODE_FIELD];
				}
				if (Object.hasOwn(payload ?? {}, "customContextWindow")) {
					if (normalizeCustomContextWindow(payload["customContextWindow"]) !== payload["customContextWindow"]) return publicError("internal", "Invalid custom context window");
					patch[CUSTOM_CONTEXT_WINDOW_FIELD] = payload[CUSTOM_CONTEXT_WINDOW_FIELD];
				}
				for (const [modelKey, field] of Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS)) {
					if (!Object.hasOwn(payload ?? {}, field)) continue;
					if (normalizeCustomContextWindow(payload[field], CUSTOM_CONTEXT_MODEL_CAPS[modelKey]) !== payload[field]) return publicError("internal", "Invalid custom model context window");
					patch[field] = payload[field];
				}
				if (Object.keys(patch).length === 0) return publicError("internal", "Invalid preference update");
				await preferences.update(patch);
			}
			return {
				ok: true,
				value: preferences.status()
			};
		} catch (error) {
			if (signal.aborted) throw error;
			return publicError("internal", "Could not update preferences");
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
			return publicError("internal", message);
		}
		if (endpoint === "reset-credit/inspect" || endpoint === "reset-credit/prepare" || endpoint === "reset-credit/consume") try {
			signal.throwIfAborted();
			return {
				ok: true,
				value: endpoint === "reset-credit/inspect" ? await resetCreditService.inspect({ signal }) : endpoint === "reset-credit/prepare" ? await resetCreditService.prepare({ signal }) : await resetCreditService.consume({
					challengeId: payload?.challengeId,
					acknowledged: payload?.acknowledged,
					signal
				})
			};
		} catch (error) {
			if (signal.aborted) throw error;
			const known = /* @__PURE__ */ new Set([
				"ChatGPT subscription is not signed in",
				"ChatGPT sign-in needs to be renewed",
				"No quota reset is available",
				"No usable quota reset is available",
				"The available quota reset expires too soon",
				"This quota reset confirmation is no longer valid",
				"This quota reset is already in progress",
				"Wait before confirming this quota reset",
				"You must acknowledge that one quota reset will be consumed",
				"The signed-in ChatGPT account changed"
			]);
			const fallback = endpoint === "reset-credit/inspect" ? "Could not read quota reset details" : endpoint === "reset-credit/prepare" ? "Could not prepare a quota reset" : "Could not use the quota reset";
			const message = error instanceof Error && known.has(error.message) ? error.message : fallback;
			return publicError("internal", message);
		}
		const result = await authHandler(endpoint, payload, signal);
		if (endpoint === "logout" && result.ok === true) {
			usageReader.clear();
			resetCreditService.clear();
			modelCatalog?.clear();
		} else if (result.ok === true && (endpoint === "status" || result.value?.authenticated === true)) modelCatalog?.refresh({ signal: void 0 }).catch(() => {});
		return result;
	};
}
function createSearchProviderSwitcher(loader) {
	const webEntry = () => [...loader.entries()].find((entry) => entry.options?.id === WEB_ENTRY_ID);
	const dshProviderId = () => {
		const baseConfig = webEntry()?.options?.config ?? {};
		return typeof baseConfig.searchProvider === "string" && baseConfig.searchProvider.length > 0 ? baseConfig.searchProvider : DSH_SEARCH_PROVIDER_FALLBACK;
	};
	return Object.freeze({
		dshProviderId,
		async select(selection) {
			const entry = webEntry();
			const fiber = entry?.fiber;
			if (entry === void 0 || fiber === void 0 || typeof fiber.update !== "function") throw new Error("DSH web runtime is unavailable");
			const baseConfig = entry.options?.config ?? {};
			const currentConfig = fiber.config ?? baseConfig;
			const dshProvider = dshProviderId();
			const provider = selection === "codex" ? CODEX_SEARCH_PROVIDER_ID : selection === "auto" ? CODEX_AUTO_SEARCH_PROVIDER_ID : dshProvider;
			if (currentConfig.searchProvider === provider) return;
			await fiber.update({
				...currentConfig,
				searchProvider: provider
			}, true);
		}
	});
}
function apply(ctx) {
	const settings = ctx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), z.object({
		[QUICK_QUOTA_MODE_FIELD]: z.union([
			"off",
			QUICK_QUOTA_MODE_PERCENT,
			"bar",
			QUICK_QUOTA_MODE_FORECAST
		]),
		[LEGACY_QUICK_QUOTA_FIELD]: z.boolean(),
		[SEARCH_PROVIDER_FIELD]: z.union([
			SEARCH_PROVIDER_AUTO,
			"dsh",
			SEARCH_PROVIDER_CODEX
		]).default(DEFAULT_SEARCH_PROVIDER),
		[SPEED_MODE_FIELD]: z.union([SPEED_MODE_STANDARD, SPEED_MODE_FAST]).default(DEFAULT_SPEED_MODE),
		[OUTPUT_VERBOSITY_FIELD]: z.union([
			OUTPUT_VERBOSITY_DEFAULT,
			"low",
			OUTPUT_VERBOSITY_MEDIUM,
			OUTPUT_VERBOSITY_HIGH
		]).default(DEFAULT_OUTPUT_VERBOSITY),
		[CONTEXT_MODE_FIELD]: z.union([
			CONTEXT_MODE_STANDARD,
			CONTEXT_MODE_EXTENDED,
			CONTEXT_MODE_CUSTOM
		]).default(DEFAULT_CONTEXT_MODE),
		[CUSTOM_CONTEXT_WINDOW_FIELD]: z.number().step(1).min(128e3).max(1e6).default(DEFAULT_CUSTOM_CONTEXT_WINDOW),
		...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, z.number().step(1).min(128e3).max(CUSTOM_CONTEXT_MODEL_CAPS[modelKey]).default(CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey])]))
	}));
	const searchProvider = createSearchProviderSwitcher(ctx.loader);
	const network = createCodexNetworkTransport();
	const originalImages = new OriginalImageStore();
	const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF, [LEGACY_CREDENTIAL_REF]);
	const baseProvider = createOpenAICodexProvider();
	let resolveAuth = async () => void 0;
	const modelCatalog = createOfficialModelCatalog({
		getAuth: (options) => resolveAuth(options),
		readCredential: (options) => store.read(PROVIDER, options),
		baseModels: () => baseProvider.getModels(),
		fetch: (input, init) => network.fetch("catalog", input, init)
	});
	const provider = openaiCodexSubscriptionProvider({
		resolveSpeedMode: () => settings.get()[SPEED_MODE_FIELD],
		resolveOutputVerbosity: () => normalizeOutputVerbosity(settings.get()[OUTPUT_VERBOSITY_FIELD]),
		resolveContextMode: () => normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
		resolveCustomContextWindow: (modelKey) => {
			const field = CUSTOM_CONTEXT_MODEL_FIELDS[modelKey];
			return normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey]);
		},
		catalog: modelCatalog,
		runNetwork: network.run
	});
	const preferences = {
		status: () => ({
			[QUICK_QUOTA_MODE_FIELD]: normalizeQuickQuotaMode(settings.get()[QUICK_QUOTA_MODE_FIELD], settings.get()[LEGACY_QUICK_QUOTA_FIELD]),
			[SEARCH_PROVIDER_FIELD]: settings.get()[SEARCH_PROVIDER_FIELD],
			[SPEED_MODE_FIELD]: settings.get()[SPEED_MODE_FIELD],
			[OUTPUT_VERBOSITY_FIELD]: normalizeOutputVerbosity(settings.get()[OUTPUT_VERBOSITY_FIELD]),
			[CONTEXT_MODE_FIELD]: normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
			[CUSTOM_CONTEXT_WINDOW_FIELD]: normalizeCustomContextWindow(settings.get()[CUSTOM_CONTEXT_WINDOW_FIELD]),
			...Object.fromEntries(Object.entries(CUSTOM_CONTEXT_MODEL_FIELDS).map(([modelKey, field]) => [field, normalizeCustomContextWindow(settings.get()[field] ?? CUSTOM_CONTEXT_MODEL_DEFAULTS[modelKey], CUSTOM_CONTEXT_MODEL_CAPS[modelKey])])),
			contextModels: contextModelGroups(provider.getModels()),
			verbosityModels: provider.getModels().filter((model) => modelCatalog.metadata(model.id)?.supportVerbosity ?? model.id !== "gpt-5.3-codex-spark").map((model) => model.id),
			writable: ctx.settings.writable
		}),
		update: (patch) => settings.update(patch)
	};
	const authModels = createModels({ credentials: store });
	authModels.setProvider(provider);
	const profile = Object.freeze({
		provider: PROVIDER,
		displayName: "ChatGPT subscription",
		piProvider: provider,
		configuredMaxTokens: /* @__PURE__ */ new Map(),
		streamIdleTimeoutMs: 600 * 1e3,
		maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
		requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
		requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
		cacheRetention: "short",
		transport: "sse"
	});
	let profileKey;
	let profileSnapshot;
	const profiles = () => {
		const key = [
			modelCatalog.revision(),
			normalizeContextMode(settings.get()[CONTEXT_MODE_FIELD]),
			...Object.values(CUSTOM_CONTEXT_MODEL_FIELDS).map((field) => settings.get()[field])
		].join(":");
		if (key !== profileKey) {
			profileKey = key;
			profileSnapshot = /* @__PURE__ */ new Map([[PROVIDER, profile]]);
		}
		return profileSnapshot;
	};
	resolveAuth = () => authModels.getAuth(PROVIDER);
	const adapterAuth = Object.freeze({
		credentials: store,
		authContext: Object.freeze({
			env: async () => void 0,
			fileExists: async () => false
		})
	});
	ctx.tools.register(createCodexImageTool({
		getAuth: resolveAuth,
		readCredential: (options) => store.read(PROVIDER, options),
		attachments: ctx.attachments,
		originalImages,
		fetch: (input, init) => network.fetch("image", input, init)
	}));
	const adapter = new PiAiAdapter({
		profiles,
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
		auth: adapterAuth,
		resolveAttachments: () => ctx.get?.("attachments")
	});
	ctx.llm.registerAdapter([PROVIDER], adapter);
	const currentAgent = () => ctx.get?.("agents")?.currentInitiator?.();
	const codexSearch = createCodexSearchProvider({
		getAuth: resolveAuth,
		readCredential: (options) => store.read(PROVIDER, options),
		resolveModel: () => {
			const request = currentAgent()?.session.requestContext?.();
			return request?.provider === PROVIDER ? request.model : void 0;
		},
		resolveSessionId: () => currentAgent()?.session.id,
		fetch: (input, init) => network.fetch("search", input, init)
	});
	ctx.web.registerSearchProvider(codexSearch);
	ctx.web.registerSearchProvider(createCodexAutoSearchProvider({
		codex: codexSearch,
		resolveModelProvider: () => currentAgent()?.session.requestContext?.()?.provider,
		resolveDshProvider: () => ctx.web.searchProviders?.get(searchProvider.dshProviderId())
	}));
	ctx.effect(() => {
		const select = async (value) => {
			try {
				await searchProvider.select(value[SEARCH_PROVIDER_FIELD]);
			} catch (error) {
				ctx.logger?.warn?.("could not select the configured web search provider: %s", error.message);
			}
		};
		select(settings.get());
		return settings.watch(select);
	}, "codex-subscription: search provider selection");
	const auth = createCodexAuthService(authModels, store, { runLogin: (operation) => network.run("login", operation) });
	const coordinator = new CodexLoginCoordinator(auth);
	const usageReader = createQuotaForecastReader({
		reader: createCodexUsageReader({
			getAuth: resolveAuth,
			readCredential: (options) => store.read(PROVIDER, options),
			fetch: (input, init) => network.fetch("quota", input, init)
		}),
		enabled: () => normalizeQuickQuotaMode(settings.get()[QUICK_QUOTA_MODE_FIELD], settings.get()[LEGACY_QUICK_QUOTA_FIELD]) === QUICK_QUOTA_MODE_FORECAST
	});
	const resetCreditService = createCodexResetCreditService({
		getAuth: resolveAuth,
		readCredential: (options) => store.read(PROVIDER, options),
		usageReader,
		fetch: (input, init) => network.fetch("quota-reset", input, init)
	});
	const handler = createSubscriptionRpcHandler({
		authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
		usageReader,
		resetCreditService,
		preferences,
		diagnosticsReader: () => createSubscriptionDiagnostics({
			auth,
			preferences,
			login: coordinator.supportState(),
			network
		}),
		modelCatalog,
		originalImages,
		resolveInheritedOriginal: (sessionId, assetId) => inheritedOriginalImageRef(ctx.get?.("sessions")?.get?.(sessionId), assetId)
	});
	ctx.effect(() => {
		modelCatalog.refresh().catch((error) => ctx.logger?.debug?.("could not refresh Codex model catalog: %s", error.message));
	}, "codex-subscription: official model catalog");
	ctx.effect(() => ctx.connection.rpc.handle(CHANNEL, handler, { authority: "trusted-host" }), "codex-subscription: DSH-trusted account RPC");
}
//#endregion
export { CODEX_IMAGE_GENERATION_URL, CODEX_IMAGE_TOOL_NAME, CODEX_RESET_CONSUME_URL, CODEX_RESET_CREDITS_URL, CODEX_USAGE_URL, CodexLoginCoordinator, DshOAuthCredentialStore, apply, assertCodexAuthUrl, commandForCodexAuthUrl, createCodexAuthService, createCodexImageTool, createCodexResetCreditService, createCodexRpcHandler, createCodexUsageReader, createSearchProviderSwitcher, createSubscriptionDiagnostics, createSubscriptionRpcHandler, decodeCodexPng, inject, name, normalizeContextMode, normalizeCustomContextWindow, openCodexAuthUrl, parseCodexUsage };
