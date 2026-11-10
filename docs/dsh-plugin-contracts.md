# DSH extension contracts

See the [architecture](ARCHITECTURE.md) and [maintenance practices](maintenance-lessons.md). These contracts were checked against DSH `0.2.2-rc.1`. Recheck them against the host version you target.

## References in DSH

Read the `cordis-plugin-development` skill and references shipped with `@deepseek-ai/dsh-agent-preset`, plus the documentation, types and inspection output for the service you use. Creator uses the `cordis` preset with tools and skills. The naming, generation and delegated installation rules for a personalized-page Creator child apply to that child.

## Contracts to preserve

- **Ownership.** Register effects under the appropriate context. Dispose them on plugin unload, agent disposal and slot collapse. Keep a disposer for registrations made in another context.
- **Extension hooks.** Use restriction and guard hooks according to their contracts. Preserve prior waterfall results and call `next()` when the decision belongs to another listener.
- **Model context.** Use supported system prompt sections, logged agent injection and native replay. Keep authoritative conversation state in the recorded history.
- **Session records.** Check restrictions on public exports. The experimental record rules in `dsh-session/README.md` restrict external plugins from calling `appendPluginRecord()`.
- **UI.** Use slot-owned React components and host theme tokens. Keep DOM and scroll ownership with the host. Check the rules for client package imports and for `dsh.client.inject` separately.
- **Operations.** Share host methods across UI and tools for ordinary data and settings operations. Reserve approval, answering user prompts and permission changes for the user.
- **Authentication and RPC.** Preserve host credential storage, authenticated owner peers, exact routes, Host and Origin checks, and cancellation.
- **Performance.** Prefer native observation and projection. Limit repeated history scans and polling while views are closed.
- **Packaging.** Verify the supported host range, public exports, browser bundle, lazy loading and npm contents against the actual artifact.

## UI components and Ultra

- The [UI primitives](../src/client-primitives.jsx) use React and host theme tokens. Menus and hints stay within their slot. Image previews use browser dialogs.
- [Ultra](../src/ultra-execution.js) uses the native DSH request record. Register delegation instructions with `systemPrompt.context()` so DSH updates and records them after `agent/request`. Switching to ordinary reasoning removes the instructions from subsequent runtime context. Preserve replay of existing logs.

## Checks by area

| Area | Implementation | Verification |
| --- | --- | --- |
| Overlays | [shell.overlay registration](../src/client.jsx), [image viewer](../src/subscription-image-viewer.jsx) | Check overlapping dialogs, scrolling, focus restoration and unload. |
| Composer predictions | [Composer layout](../src/composer-prediction-layout.js) | Check editor replacement by the host or theme and restoration of temporary layout changes. |
| Control colors | [Previews](../src/client-image-previews.jsx), [styles](../src/client-styles.js) | Check light, dark and high-contrast themes. Preserve artwork colors. |
| Settings operations | [RPC](../src/subscription-rpc.js), [tool registration](../src/index.js) | Compare results, failures and state changes across UI and tools. Preserve user-only approval. |
| Source maps | [Build](../tsdown.config.mjs), [manifest](../package.json) | Check that source-map references match the intended package contents. |

Check the applicable contract for exports such as `dsh-plugin-manager/operations` and for native session observation. Record whether the issue involves a deprecated path, a prohibited API, a proposed improvement or an observed runtime failure.

## Verifying a migration

1. Pin the host version and plugin commit. Confirm the supported replacement API's signature, dispatch and context ownership.
2. Check existing UI, settings, logs, cancellation and permissions.
3. Run regression and fault tests. Verify relevant real-host behavior, including theme, narrow layout, accessibility, unload, re-enable, fork, resume or import.
4. Record build, packaged install, restart and task results. Publish the reproduction details required for others to verify the change.
