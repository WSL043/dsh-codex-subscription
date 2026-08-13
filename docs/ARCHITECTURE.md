# Architecture

The repository is one DSH bundle with four deliberately separate surfaces:

1. `boundary` publishes the immutable `openai-codex` trust and fallback policy.
2. `index` registers one DSH LLM adapter, one OAuth service, bounded telemetry, and one loopback-only RPC channel.
3. `client` contributes one removable section to DSH Settings. It receives only redacted account state, quota projections, and aggregate telemetry.
4. `cordis.patch.yml` composes the boundary before the provider plugin and changes no default model.

The plugin talks directly through the exact pi-ai peer already owned by DSH's pi-ai adapter. It does not install a second provider dependency tree, spawn Codex CLI, embed another agent loop, or proxy prompts through a browser page. DSH remains responsible for sessions, tools, permissions, attachments, model selection, and the visible application shell.

## Credential flow

```text
DSH Settings client
  -> loopback RPC: login intent only
  -> host login coordinator
  -> pi-ai OpenAI OAuth flow
  -> DSH credential service: opaque OAuth JSON
```

The browser receives authentication state and expiry time, never access/refresh tokens or account identifiers. Credential modifications are serialized so an older refresh cannot overwrite a newer rotated credential.

## Failure policy

- Missing or expired subscription credentials fail the Codex route.
- Provider retry policy is not overridden with hidden retries.
- No route points to OpenAI API billing or another model provider.
- Usage failures do not stop model turns; they only mark the optional settings projection unavailable.
- An invalid provider boundary prevents plugin startup instead of running with a weaker policy.
