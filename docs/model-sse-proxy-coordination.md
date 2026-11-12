# Model SSE proxy coordination

The plugin provides the process-local Cordis service `codexModelSseProxy`.
A cooperating host plugin can inject it and register exactly one provider:

```js
ctx.effect(() => ctx.get('codexModelSseProxy').register({
  current: () => ready ? { proxy: currentConnectOrigin, ca: optionalPemCa } : undefined,
}))
```

`current()` is synchronous and returns a ready HTTP(S) CONNECT origin. Endpoint readiness, lifecycle and migration belong to the registering plugin. No credentials or message bodies are passed to it. The subscription plugin snapshots the endpoint before each model SSE operation and owns sending. Optional PEM CA applies only to that operation, with TLS verification enabled; it does not modify process-wide trust.

An explicit `DSH_CODEX_SSE_PROXY` remains the manual override. Without an override, an unavailable or disposed provider fails closed after it has claimed transport. No silent direct fallback or automatic replay is introduced. Recovery may register a new ready provider. Disabling cooperation requires restarting the subscription plugin, with the operator responsible for existing history compatibility. OAuth, quota, phone and WebSocket routing are unchanged.

billion-context 0.1.213 does not register this service, so installing both plugins alone does not enable dynamic coordination. Automatic integration depends on an endpoint provider using this contract. This plugin does not inspect private state files, scan ports, call browser discovery routes or modify another plugin. The existing explicit proxy setting remains available.

This is a subscription-plugin service built on Cordis, not an upstream DSH network API. Acceptance with a temporary endpoint provider covered real encrypted checkpoint replay through CONNECT, changing the endpoint between turns without restarting, and excluding the compressed original text from the next request. This does not establish automatic support in unmodified third-party plugins.

