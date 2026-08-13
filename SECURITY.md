# Security policy

## Supported version

Security fixes are applied to the latest tagged release. DeepSeek Harness is a developer preview, so compatibility fixes may require upgrading both DSH and this bundle.

## Reporting a vulnerability

Use a private GitHub security advisory at:

https://github.com/WSL043/dsh-codex-subscription/security/advisories/new

Do not open a public issue containing access tokens, refresh tokens, account identifiers, callback URLs with authorization codes, raw DSH credential data, or private prompts. Include the affected version, operating system, DSH version, a minimal reproduction, and impact. Replace all credentials with unmistakably fake placeholders.

## Trust boundary

- The plugin runs with the privileges of the DSH host process.
- OAuth credentials remain in DSH's host credential service.
- The browser settings client can call only a loopback-authorized, redacted RPC surface.
- Login links are restricted to the HTTPS `auth.openai.com` origin before they are returned or opened.
- Usage requests are host-side, use a bounded timeout, refuse redirects, and return parsed quota projections rather than provider payloads.
- Cache telemetry stores no prompts, responses, session IDs, tokens, account IDs, or returned fingerprint hashes. Its per-session state is bounded and process-local.
- The bundle defines no API-key or cross-provider fallback.

Installing any DSH plugin grants its host code access to the services named in its composition. Review the tag or commit you install. Prefer a tagged version or a full commit hash over a moving branch.

## Out of scope

- availability or policy changes in ChatGPT, Codex, OpenAI OAuth, or DeepSeek Harness
- compromised host machines or compromised DSH installations
- secrets deliberately pasted into prompts, logs, issues, or screenshots
- provider billing or quota disputes
