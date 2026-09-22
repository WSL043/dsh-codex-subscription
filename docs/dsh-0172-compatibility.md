# DSH 0.1.7-alpha.2 compatibility

The candidate accepts the alpha.2 dependency cohort and uses the user-provided plugin icon through native package metadata. The icon is a 256px WebP below the host 256 KiB limit; the source image is unchanged.

## Evidence

- 355 behavior checks passed against the actual alpha.2 dependency graph.
- Real subscription reply, tool round trip, and WebSocket-option request completed. Fallback remains allowed, so this does not assert the effective transport.
- The rc.3 optional subtask completed through the new host subprocess service without creating auth.json.
- Native image offload, JSONL reload, fork and new image references passed.
- Installed candidate in an isolated alpha.2 host: native plugin page loaded the icon, visually inspected. Settings, sketch drawing and attachment to the composer passed.

## Upstream ownership

The new spill policy uses maxInlineTokens rather than maxInlineBytes. The subscription plugin declares neither override and continues to return native image blocks; no competing truncation layer was added. Background task wakeups, multiline queue editing, reconnect behavior and registry selection remain owned by DSH. The subtask completion check is not a stress test of repeated background wakeups.

## Stable-host release gate

A clean rc.2 host with no subscription plugin reproduced the missing HMR service
failure after its open vendor ranges selected newer Cordis packages. Retaining
the vendor versions declared by that host restored HTTP readiness. The isolated
acceptance runner now pins both the DSH cohort and its declared Cordis, Cosmokit
and Schemastery generation. This does not change installed users' dependencies.
The stable-host claim covers that declared dependency baseline, not arbitrary
future vendor resolutions. The failed release log is retained for diagnosis.
