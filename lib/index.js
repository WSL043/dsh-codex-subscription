import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { LlmError, createUserMessage } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { spawn } from "node:child_process";
import { openaiCodexProvider as createOpenAICodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { createModels } from "@earendil-works/pi-ai";
import { randomUUID } from "node:crypto";
import { WebError } from "@deepseek-ai/dsh-web";
import { defineTool } from "@deepseek-ai/dsh-tools";
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
//#region src/settings-contract.js
const SETTINGS_NAMESPACE = "codex-subscription";
const QUICK_QUOTA_FIELD = "quickQuotaVisible";
const SEARCH_PROVIDER_FIELD = "searchProvider";
const SEARCH_PROVIDER_CODEX = "codex";
const SPEED_MODE_FIELD = "speedMode";
const SPEED_MODE_STANDARD = "standard";
const SPEED_MODE_FAST = "fast";
const DEFAULT_SPEED_MODE = SPEED_MODE_STANDARD;
const supportsCodexFastMode = (modelId) => typeof modelId === "string" && (/^gpt-5\.(?:5|6)(?:$|-)/u.test(modelId) || modelId === "gpt-5.4");
//#endregion
//#region src/pi-ai-runtime.js
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
function openaiCodexSubscriptionProvider({ resolveSpeedMode = () => void 0 } = {}) {
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
	const withSpeed = (model, options = {}) => {
		if (resolveSpeedMode() !== "fast" || !supportsCodexFastMode(model?.id)) return options;
		const onPayload = options.onPayload;
		return {
			...options,
			serviceTier: "fast",
			async onPayload(payload, requestModel) {
				const fastPayload = {
					...payload,
					service_tier: "fast"
				};
				return {
					...await onPayload?.(fastPayload, requestModel) ?? fastPayload,
					service_tier: "fast"
				};
			}
		};
	};
	return Object.freeze({
		...provider,
		auth: Object.freeze({
			...provider.auth,
			apiKey: requestToken
		}),
		stream: (model, context, options) => provider.stream(model, context, withSpeed(model, options)),
		streamSimple: (model, context, options) => provider.streamSimple(model, context, withSpeed(model, options))
	});
}
//#endregion
//#region src/version.js
const PACKAGE_VERSION = "1.3.0";
const USER_AGENT = `dsh-codex-subscription/${PACKAGE_VERSION}`;
//#endregion
//#region src/codex-search.js
const CODEX_SEARCH_PROVIDER_ID = "codex-subscription";
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
//#endregion
//#region src/codex-images.js
const CODEX_IMAGE_TOOL_NAME = "codex_image_generate";
const CODEX_IMAGE_GENERATION_URL = "https://chatgpt.com/backend-api/codex/images/generations";
const IMAGE_MODEL = "gpt-image-2";
const RESPONSE_ENVELOPE_BYTES = 1024 * 1024;
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
function encodedLimit(decodedBytes) {
	return Math.ceil(decodedBytes / 3) * 4;
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
	if (encoded === void 0 || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw new Error("Codex returned an invalid base64 PNG");
	const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
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
		description: "Generate an image from a detailed description using the signed-in Codex subscription. Use this whenever the user asks to create an image.",
		parameters: { prompt: {
			type: "string",
			required: true,
			description: "A complete, production-ready description of the image to generate."
		} },
		output: {
			schema: imageOutputSchema(),
			render: (_args, value) => imageContent(value)
		},
		timeoutMs: 300 * 1e3,
		isConcurrencySafe: () => false,
		async execute(args, exec) {
			const prompt = nonEmpty(args.prompt);
			if (prompt === void 0) throw new Error("prompt must be a non-empty string");
			const auth = await options.getAuth({ signal: exec.signal });
			const credential = await options.readCredential({ signal: exec.signal });
			const access = auth?.auth?.apiKey;
			const accountId = credential?.type === "oauth" ? credential.accountId : void 0;
			if (typeof access !== "string" || access.length === 0 || typeof accountId !== "string" || accountId.length === 0) throw new Error("ChatGPT subscription is not signed in");
			if (!attachments.imageLimits.mediaTypes.includes("image/png")) throw new Error("This DSH installation does not accept PNG image attachments");
			const maximumBytes = Math.min(attachments.imageLimits.maxImageBytes, attachments.imageLimits.maxMessageImageBytes);
			let response;
			try {
				response = await fetchImage(CODEX_IMAGE_GENERATION_URL, {
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
						prompt,
						background: "auto",
						model: IMAGE_MODEL,
						quality: "auto",
						size: "auto"
					}),
					signal: exec.signal
				});
			} catch (error) {
				if (exec.signal.aborted) throw exec.signal.reason;
				throw new Error("Codex image generation request failed", { cause: error });
			}
			if (!response.ok) {
				if (response.status === 401 || response.status === 403) throw new Error("ChatGPT sign-in needs to be renewed");
				if (response.status === 429) throw new Error("Codex image generation quota is unavailable");
				throw new Error(`Codex image generation failed (HTTP ${response.status})`);
			}
			const metadata = responseMetadata(await readJsonWithin(response, encodedLimit(maximumBytes) + RESPONSE_ENVELOPE_BYTES));
			const data = decodeCodexPng(metadata.encoded, maximumBytes);
			const result = {
				image: imageReference(await attachments.saveImage({
					data,
					mediaType: "image/png",
					name: "codex-generated.png"
				})),
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
//#region src/diagnostics.js
/** Build a support report that deliberately excludes OAuth and account metadata. */
async function createSubscriptionDiagnostics({ auth, preferences }) {
	let account = { status: "unknown" };
	const issues = [];
	try {
		account = { status: (await auth.status()).authenticated === true ? "signed-in" : "signed-out" };
	} catch {
		issues.push({ code: "account-status-unavailable" });
	}
	return {
		schemaVersion: 1,
		package: "dsh-codex-subscription",
		version: PACKAGE_VERSION,
		runtime: { node: process.version },
		account,
		provider: {
			id: "openai-codex",
			transport: "sse",
			cache: {
				owner: "dsh/pi-ai",
				retention: "short"
			}
		},
		capabilities: {
			models: true,
			quota: true,
			search: true,
			imageGeneration: true,
			composerQuota: true,
			speedMode: true
		},
		configuration: preferences.status(),
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
	return { availableCount: value.available_count };
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
//#region src/reset-credits.js
const CODEX_RESET_CREDITS_URL = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";
const CODEX_RESET_CONSUME_URL = `${CODEX_RESET_CREDITS_URL}/consume`;
const RESET_CONFIRM_PHRASE = "USE RESET";
const DEFAULT_CONFIRM_DELAY_MS = 5e3;
const DEFAULT_CHALLENGE_TTL_MS = 6e4;
const DEFAULT_TIMEOUT_MS = 15e3;
const MAX_COPY_LENGTH = 240;
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
function parseDetails(value, now) {
	if (!record(value) || !Number.isSafeInteger(value.available_count) || value.available_count < 0 || !Array.isArray(value.credits)) throw new Error("ChatGPT returned malformed quota reset details");
	if (value.available_count === 0) throw new Error("No quota reset is available");
	const available = value.credits.filter((credit) => record(credit) && typeof credit.id === "string" && credit.id.length > 0 && credit.id.length <= 256 && typeof credit.status === "string" && credit.status.toLowerCase() === "available").map((credit) => {
		const expiresAt = credit.expires_at === void 0 || credit.expires_at === null ? void 0 : credit.expires_at * 1e3;
		if (expiresAt !== void 0 && (!Number.isSafeInteger(credit.expires_at) || credit.expires_at <= 0)) throw new Error("ChatGPT returned malformed quota reset details");
		return {
			credit,
			expiresAt
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
	return {
		code: value.code,
		windowsReset
	};
}
function quotaIsExhausted(usage) {
	return Array.isArray(usage?.rateLimits) && usage.rateLimits.some((limit) => limit?.id !== "code_review" && Array.isArray(limit?.windows) && limit.windows.some((window) => Number.isFinite(window?.usedPercent) && window.usedPercent >= 100));
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
	return Object.freeze({
		async prepare({ signal } = {}) {
			const { access, accountId } = await resolveCredentials(signal);
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
			const details = parseDetails(raw, now());
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
				expiresAt
			});
			return {
				challengeId,
				availableCount: details.availableCount,
				confirmPhrase: RESET_CONFIRM_PHRASE,
				readyAt,
				expiresAt,
				...details.title === void 0 ? {} : { title: details.title },
				...details.description === void 0 ? {} : { description: details.description }
			};
		},
		async consume({ challengeId, phrase, signal } = {}) {
			const challenge = typeof challengeId === "string" ? challenges.get(challengeId) : void 0;
			if (challenge === void 0) throw new Error("This quota reset confirmation is no longer valid");
			if (challenge.state === "pending") throw new Error("This quota reset is already in progress");
			if (now() < challenge.readyAt) throw new Error("Wait before confirming this quota reset");
			if (now() > challenge.expiresAt) {
				challenges.delete(challengeId);
				throw new Error("This quota reset confirmation is no longer valid");
			}
			if (phrase !== "USE RESET") throw new Error("The quota reset confirmation phrase does not match");
			challenge.state = "pending";
			try {
				if (!quotaIsExhausted(await usageReader.read({
					force: true,
					signal
				}))) throw new Error("The current Codex quota is not exhausted");
				const { access, accountId } = await resolveCredentials(signal);
				if (accountId !== challenge.accountId) throw new Error("The signed-in ChatGPT account changed");
				const response = await fetchReset(CODEX_RESET_CONSUME_URL, {
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
				if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "ChatGPT sign-in needs to be renewed" : `ChatGPT quota reset request failed (HTTP ${response.status})`);
				let raw;
				try {
					raw = await response.json();
				} catch {
					throw new Error("ChatGPT returned an unreadable quota reset response");
				}
				const result = parseConsumeResult(raw);
				usageReader.clear();
				return result;
			} finally {
				challenges.delete(challengeId);
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
function createSubscriptionRpcHandler({ authHandler, usageReader, resetCreditService, preferences, diagnosticsReader }) {
	return async (endpoint, payload, signal) => {
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
				if (Object.hasOwn(payload ?? {}, "quickQuotaVisible")) {
					if (typeof payload["quickQuotaVisible"] !== "boolean") return publicError("internal", "Invalid quick quota preference");
					patch[QUICK_QUOTA_FIELD] = payload[QUICK_QUOTA_FIELD];
				}
				if (Object.hasOwn(payload ?? {}, "searchProvider")) {
					if (!["dsh", "codex"].includes(payload["searchProvider"])) return publicError("internal", "Invalid search provider preference");
					patch[SEARCH_PROVIDER_FIELD] = payload[SEARCH_PROVIDER_FIELD];
				}
				if (Object.hasOwn(payload ?? {}, "speedMode")) {
					if (!["standard", "fast"].includes(payload["speedMode"])) return publicError("internal", "Invalid speed mode preference");
					patch[SPEED_MODE_FIELD] = payload[SPEED_MODE_FIELD];
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
		if (endpoint === "reset-credit/prepare" || endpoint === "reset-credit/consume") try {
			signal.throwIfAborted();
			return {
				ok: true,
				value: endpoint === "reset-credit/prepare" ? await resetCreditService.prepare({ signal }) : await resetCreditService.consume({
					challengeId: payload?.challengeId,
					phrase: payload?.phrase,
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
				"The quota reset confirmation phrase does not match",
				"The current Codex quota is not exhausted",
				"The signed-in ChatGPT account changed"
			]);
			const fallback = endpoint === "reset-credit/prepare" ? "Could not prepare a quota reset" : "Could not use the quota reset";
			const message = error instanceof Error && known.has(error.message) ? error.message : fallback;
			return publicError("internal", message);
		}
		const result = await authHandler(endpoint, payload, signal);
		if (endpoint === "logout" && result.ok === true) {
			usageReader.clear();
			resetCreditService.clear();
		}
		return result;
	};
}
function createSearchProviderSwitcher(loader) {
	const webEntry = () => [...loader.entries()].find((entry) => entry.options?.id === WEB_ENTRY_ID);
	return Object.freeze({ async select(selection) {
		const entry = webEntry();
		const fiber = entry?.fiber;
		if (entry === void 0 || fiber === void 0 || typeof fiber.update !== "function") throw new Error("DSH web runtime is unavailable");
		const baseConfig = entry.options?.config ?? {};
		const currentConfig = fiber.config ?? baseConfig;
		const dshProvider = typeof baseConfig.searchProvider === "string" && baseConfig.searchProvider.length > 0 ? baseConfig.searchProvider : DSH_SEARCH_PROVIDER_FALLBACK;
		const provider = selection === "codex" ? CODEX_SEARCH_PROVIDER_ID : dshProvider;
		if (currentConfig.searchProvider === provider) return;
		await fiber.update({
			...currentConfig,
			searchProvider: provider
		}, true);
	} });
}
function apply(ctx) {
	const settings = ctx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), z.object({
		[QUICK_QUOTA_FIELD]: z.boolean().default(false),
		[SEARCH_PROVIDER_FIELD]: z.union(["dsh", SEARCH_PROVIDER_CODEX]).default("dsh"),
		[SPEED_MODE_FIELD]: z.union([SPEED_MODE_STANDARD, SPEED_MODE_FAST]).default(DEFAULT_SPEED_MODE)
	}));
	const searchProvider = createSearchProviderSwitcher(ctx.loader);
	const preferences = {
		status: () => ({
			[QUICK_QUOTA_FIELD]: settings.get()[QUICK_QUOTA_FIELD],
			[SEARCH_PROVIDER_FIELD]: settings.get()[SEARCH_PROVIDER_FIELD],
			[SPEED_MODE_FIELD]: settings.get()[SPEED_MODE_FIELD],
			writable: ctx.settings.writable
		}),
		update: (patch) => settings.update(patch)
	};
	const store = new DshOAuthCredentialStore(ctx.credentials, CREDENTIAL_REF, [LEGACY_CREDENTIAL_REF]);
	const provider = openaiCodexSubscriptionProvider({ resolveSpeedMode: () => settings.get()[SPEED_MODE_FIELD] });
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
	const profiles = /* @__PURE__ */ new Map([[PROVIDER, profile]]);
	const resolveAuth = () => authModels.getAuth(PROVIDER);
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
		attachments: ctx.attachments
	}));
	const adapter = new PiAiAdapter({
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
		auth: adapterAuth,
		resolveAttachments: () => ctx.get?.("attachments")
	});
	ctx.llm.registerAdapter([PROVIDER], adapter);
	const currentAgent = () => ctx.get?.("agents")?.currentInitiator?.();
	ctx.web.registerSearchProvider(createCodexSearchProvider({
		getAuth: resolveAuth,
		readCredential: (options) => store.read(PROVIDER, options),
		resolveModel: () => {
			const request = currentAgent()?.session.requestContext?.();
			return request?.provider === PROVIDER ? request.model : void 0;
		},
		resolveSessionId: () => currentAgent()?.session.id
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
	const auth = createCodexAuthService(authModels, store);
	const coordinator = new CodexLoginCoordinator(auth);
	const usageReader = createCodexUsageReader({
		getAuth: resolveAuth,
		readCredential: (options) => store.read(PROVIDER, options)
	});
	const resetCreditService = createCodexResetCreditService({
		getAuth: resolveAuth,
		readCredential: (options) => store.read(PROVIDER, options),
		usageReader
	});
	const handler = createSubscriptionRpcHandler({
		authHandler: createCodexRpcHandler(coordinator, { openExternal: openCodexAuthUrl }),
		usageReader,
		resetCreditService,
		preferences,
		diagnosticsReader: () => createSubscriptionDiagnostics({
			auth,
			preferences
		})
	});
	ctx.effect(() => ctx.connection.rpc.handle(CHANNEL, handler, { authority: "loopback" }), "codex-subscription: loopback account RPC");
}
//#endregion
export { CODEX_IMAGE_GENERATION_URL, CODEX_IMAGE_TOOL_NAME, CODEX_RESET_CONSUME_URL, CODEX_RESET_CREDITS_URL, CODEX_USAGE_URL, CodexLoginCoordinator, DshOAuthCredentialStore, RESET_CONFIRM_PHRASE, apply, assertCodexAuthUrl, commandForCodexAuthUrl, createCodexAuthService, createCodexImageTool, createCodexResetCreditService, createCodexRpcHandler, createCodexUsageReader, createSearchProviderSwitcher, createSubscriptionDiagnostics, createSubscriptionRpcHandler, decodeCodexPng, inject, name, openCodexAuthUrl, parseCodexUsage };
