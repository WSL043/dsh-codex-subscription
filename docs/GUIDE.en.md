# User guide

[Back to README](../README.en.md) · [简体中文](GUIDE.zh-CN.md)

## Find what you need

| I want to… | Where to start |
| --- | --- |
| Install, sign in again or diagnose an account error | [Install](../README.en.md#install) · [Sign-in and quota status](#sign-in-and-quota-status) |
| Show remaining quota or use a reset | [Composer quota](#composer-quota) · [Quota reset](#quota-reset) |
| Pick a search source or use a connected app | [Web search](#web-search) · [ChatGPT connectors](#connectors) |
| Change response speed or use Tab to fill a draft | [Codex speed](#codex-speed) · [Input predictions](#predictions) |
| Edit an image or draw on the canvas | [Images](#images) · [Sketch canvas](#sketch) |
| Pair a phone or start a voice conversation | [Phone remote control](#phone) · [Voice conversations](#voice) |

## Feature details

### Add instructions while a task is running

Use DSH’s native message queue: messages sent during generation can wait for the next turn. Where the host offers interjection, its shortcut delivers queued input at the next step of the current turn. This does not immediately rewrite a response already being generated.

<a id="voice"></a>

### Voice conversations (Beta)

Enable voice conversations, then use the voice button while the composer is empty. You can speak while the assistant is talking. The voice conversation can change direction while the DSH task keeps running.

When DSH needs you to choose or confirm, use the question card in the chat. Spoken numbers or labels do not submit a choice. If DSH replaces the composer with the question card, you can resume voice in the same chat after answering. Free-text questions can still be answered aloud.

On Desktop, DSH posts background results in chat while the voice conversation continues. Ask about the result whenever you want to discuss it.

Choosing a voice or changing the answer language plays a sample in that language. “Same as you speak” uses an English preview while the conversation still follows your spoken language. Voices without a sample are marked unavailable.

### GPT-Reserve (Experimental)

When the account’s official catalog advertises `gpt-reserve`, it appears at the end of the model picker as an experimental option. Availability and billing are determined by the service; a successful response does not confirm use of a separate reserve allowance. Even when ordinary Codex usage reaches 100%, the service may list `gpt-reserve` in the model catalog without returning a separate Reserve quota bucket. In that case, the composer treats Reserve quota as unknown and does not substitute ordinary Codex quota. An “allowed” response does not prove that a request was charged to Reserve.

### GPT-6 Sol / Luna

GPT-6 Sol and GPT-6 Luna are listed in [OpenAI's Codex model guidance](https://learn.chatgpt.com/docs/models). The plugin reads available models and reasoning levels from the current account's Codex catalog, so no model ID needs to be added manually; models do not appear before the account gets access. Sol suits complex coding, while Luna suits focused, high-volume tasks. Their extended context limits and Fast availability follow the account catalog. Models marked for retirement in the catalog show their retirement date next to the model name; your selection is never switched automatically.

### GPT-6 Astra context

**Model-aware context** follows the model directory. Refreshes do not overwrite an unsaved draft.

When the official model catalog exposes GPT-6 Astra, Standard preserves the catalog window, Extended uses 872000 tokens, and Custom accepts 128000–872000 tokens (initially 272000). This limit follows the [official Codex model catalog](https://github.com/openai/codex/blob/6af345407d9c2a568da9d01b6c4b81a9e61495c0/codex-rs/models-manager/models.json#L33-L34), not the API model's total context capacity. These settings only adjust DSH's local context budget; they do not grant model access or guarantee an account's server-side capacity. Actual availability remains subject to the service.

### Default model

Choose the model a new conversation opens with under **Settings → Codex subscription → Models → Default model**. It writes DSH's own default-model setting, the same one a model switch inside a chat writes: every conversation created afterwards uses it, and switching to another model in a chat (including a non-subscription one) is reflected here as **Follow DSH default**.

Choose **Restore DSH default** in the menu to clear the saved selection in this profile and use its inherited default. Existing conversations are unchanged; this does not recover a personal selection that was previously overwritten. Restoration remains available without a model catalog when the native DSH configuration editor supports it; unsupported hosts disable the action.

<a id="sign-in-and-quota-status"></a>

### Sign-in and quota status

| What you see in **Settings → Codex → Start** | What to do |
| --- | --- |
| **Not signed in** | Use the browser or device-code sign-in. |
| **Sign-in expired** | Use **Sign in again** on that saved account. |
| **Could not verify sign-in** or quota could not be updated | The check did not finish successfully. Try **Refresh** under **Subscription quota** after checking your connection. |
| A quota percentage with an earlier fetch time | The value is from the last successful read. Refresh before relying on it, especially after the reset time. |

<a id="composer-quota"></a>

### Composer quota

Quota groups follow backend-provided data; missing limits are not invented.

Live example: GPT-6-Astra with Max (the highest reasoning level) and Fast mode (lightning icon), with remaining quota visible on the left.

Choose Off, Percent, Progress bar, or Beta Runway under Account. When a five-hour window exists, the composer shows that window only; the popover retains all windows. A weekly-only display omits the week label and uses compact durations such as `36% · ≈10h–12h`.

Runway uses official observations from the recent two hours, including unchanged readings. Repeated boundary crossings can refine the rate interval when the assumptions hold; insufficient evidence or changing intensity falls back to a conservative estimate. It remains Beta and is not a guarantee of working time. History is bounded and stored locally; resets, long gaps or disabling the feature restart calibration.
Spark keeps its independent quota. The plugin does not invent five-hour limits, Credits, or spending caps that the service did not return.

<a id="web-search"></a>

### Web search

Under **Settings → Codex → Web & tools**, **Search source** finds pages and **Webpage reading source** opens a URL to retrieve its content. The two settings are independent.

- **Auto** prefers subscription search for Codex models and DSH search for other models. It tries the other source only when sign-in or a key is missing, or the preferred service is unavailable.
- **DSH** uses the search service configured in DSH. Charges depend on that service.
- **Codex** uses subscription search. With subscription features for other models turned off, non-Codex conversations use native DSH search.
- If search returns links but the page text is missing, check the webpage reader and whether it can access that URL. The Codex reader reports its own failures directly.

<a id="connectors"></a>

### ChatGPT connectors

Set **ChatGPT connectors** under Web & tools to Read-only, Write after asking or Write directly, and every DSH model (DeepSeek included) gains three tools: `chatgpt_connectors_search` finds tools in the apps you connected in ChatGPT, `chatgpt_connectors_describe` shows their arguments, and `chatgpt_connectors_call` runs one. Apps such as GitHub, Gmail, Google Drive and Google Calendar work as far as your account has them connected.

- **Read-only** runs only tools the app marks read-only (search mail, read files, look up pull requests).
- **Write after asking** requires DSH approval before changing data. If no prompt appears, open the current session's permission menu in the composer or run `/permission`. On the standard DSH profile, **Workspace Write** allows prompts and **Full access** disables them. A change runs only after approval.
- **Write directly** runs the same changing calls immediately with no approval; a mistake cannot be undone. Use it only when you trust the model and the task.
- What an app returns is third-party content and models are told not to follow instructions inside it. Account, safety and plugin-management tools of ChatGPT are not exposed.
- Connect the apps in ChatGPT first. Off by default; the tool list is cached for 10 minutes.

### Usage overview

Under the quota card, "Usage overview" shows the official usage statistics: lifetime tokens, busiest day, current and longest streak, conversations, most used reasoning level, fast mode share, longest turn, and a half-year heatmap of daily token use (darker is busier, hover for the day's number). Only the numbers are read, never the profile picture or user name; it loads when expanded and is cached for 30 minutes.

### Where the allowance went

Under the quota card, "Where the allowance went (weekly)" shows how each week's allowance was spent: by model, by surface (desktop app and so on), by source (your chats, subtasks, memory upkeep) and by trigger, as a percentage of that period's allowance. It comes from the official usage report, so only periods that have been counted show a split, usually a day or two late; accounts without the report do not show the section. It is read only when you expand it and does not affect normal quota refreshes.

<a id="quota-reset"></a>

### Safe quota reset

If ChatGPT reports available quota resets, Settings shows each one in its own compact row with its disclosed name and expiry.
You may deliberately try it before a quota reaches 100%, which is useful for a reset nearing expiry. ChatGPT still
decides whether a window needs resetting and may return **nothing to reset** without spending the reset. The final
action requires an acknowledgement checkbox and five-second cooldown. Cancel never consumes a reset, rapid repeated
clicks are single-flight, and an uncertain network result is never retried automatically.

<a id="images"></a>

### Image generation and editing

A basic viewer derived from `dsh-image-viewer` is now built in, with no extra installation required. Plugin-generated image cards use the built-in viewer to keep annotation and continue-editing actions available. You can zoom, pan, fit, add region notes, and download the image. The standard **Download** action retrieves the permission- and integrity-checked exact original by default; only legacy sessions without an exact original fall back to the conversation preview.

New and edited images return the exact original path on the current DSH host in the tool result, so a model or Agent can read or copy the file. The path is on the host running DSH, not a browser download link; original downloads remain session-authorized. Uninstalling the plugin does not delete generated originals.

**Continue editing in composer** does not send automatically. With annotations, it attaches the clean source and a numbered location-reference image, and includes matching numbers, coordinates, notes, and instructions to exclude the markers from the result. Without annotations, it attaches only the opened image. Every marker needs a note; reference preparation failures stop the handoff. Press **Enter** to save and collapse a region note; use **Shift+Enter** for a new line. Notes remain available when the same image is reopened during the current DSH page session.

A new image request does not silently include earlier images. GPT Image 2 can take longer than a normal text turn, and detailed text, exact composition, or repeated-character consistency may still need another pass.

<p align="center">
  <img src="assets/annotate-en.webp" width="800" alt="Generated image, region note, and continue editing inside the DSH Image Viewer">
</p>

The screenshot above illustrates image viewing and on-image notes; available buttons can vary with the image and installed viewer version.

<a id="sketch"></a>

### Sketch canvas (Beta)

Use the composer pen button for manual drawing. Selecting `@sketch` only inserts the Agent entry into the composer; the Agent opens the board after you send your drawing request. You can also choose Open in sketch from an enhanced image preview. Attachment intake and removal use the native DSH component.

Sketch supports local drafts, image layers, aspect ratios, three brushes (solid ink, grainy pencil and translucent highlighter), lines and shapes, two erasers, undo/redo, pan/zoom and configurable shortcuts. Smoothing processes a completed stroke only after release. Up to 20 drafts stay in the current browser; attaching a sketch never sends it automatically. Its image panel manages only the current sketch, not the conversation library.

The board supports editable shapes and text, native curves, and a side control for size/opacity. During Agent drawing, you can view, zoom, close the panel or stop drawing; manual edits unlock when it finishes. Automatic completion previews are off by default and can be enabled under Images & sketch. Drawing continues when you switch conversations, and multiple conversations can draw independently. Each board keeps its document, history and run state when you return. Save your draft before a full-page reload or exit.

**Sketch to image**: draw, click Attach, describe the desired result in the composer, then send; the sketch is the reference image and the composition is kept.

**Agent drawing from a reference**: attach the reference and send `@sketch` plus a request. The agent first puts the reference on the board as a hidden layer with `reference`, then draws in stages; every batch reports how the error changed, and it can compare side by side, read a difference heat map, zoom into a region, measure colours and edge positions, and undo. The board's Replay redraws the process stroke by stroke and can record it as a video (previewed first, saved only when you click Save video). Measured comparisons are in the README's "Sketch drawing, measured", the log is in [Drawing experiments](archive/sketch-drawing-experiments.md). The agent prefers the SVG command to draw a whole stage at once; the import still produces editable native strokes.

Flare / Sunburst request overrides remain experimental: successful generation does not confirm which image engine or quality the subscription backend used.

<a id="predictions"></a>

### Input predictions (Beta)

Enable **Input predictions** under **Settings → Codex subscription → Models**; it is off by default. GPT-6 Astra, GPT-6.1 Sol and GPT-6.1 Terra are supported, subject to the account's official prediction capability check.

After a completed reply, an empty draft can receive a suggested next message based on the current conversation text. Focus the composer to see the grey suggestion; Tab inserts it as an editable, undoable draft without sending. Briefly losing focus preserves the same request and result. Editing the draft, switching conversations or accounts, or disabling predictions invalidates the old suggestion. The model may return no suggestion.

If you undo or clear an accepted draft without sending, the empty composer shows the same cached suggestion without another model request. Only one suggestion for the current context is retained, for up to five minutes; changing models, conversations, accounts or turns invalidates it.

[OpenAI states](https://learn.chatgpt.com/docs/features/composer-predictions) that generating predictions in official Codex does not count toward usage limits or consume credits; sending an accepted prediction is metered normally. DSH makes additional prediction requests, and the same exemption for this third-party integration is unconfirmed, so the plugin does not promise free predictions. Predictions neither retrieve other conversations nor run tools.

<a id="codex-speed"></a>

### Codex speed

Choose speed and output verbosity under **Settings → Codex subscription → Models**. You can also adjust them in the subscription model menu when the selected model supports them. The default **Auto** menu mode yields to another picker or Claude Style. Choose **DSH standard** to give control of the picker to DSH or another plugin. Fast mode prioritizes requests and can use more Credits. [OpenAI Codex Speed documentation](https://learn.chatgpt.com/docs/agent-configuration/speed).

On DSH 0.2.2-rc.2, the subscription plugin adds speed and output detail through the model menu's extension slots, preserving DSH's Agent Teams control. Fast mode uses the inline lightning icon when the menu renders DSH's label slot and no other plugin owns that label. Third-party menus decide which host extensions they render; the subscription plugin does not change their settings or inject controls into their private UI. Speed and output detail remain available in subscription settings even when the active menu does not display them.

**Ultrafast (Beta).** The speed setting offers “Ultrafast” only when the current account's catalog lists an `ultrafast` tier for that model (at the developer event: GPT-6 Astra on Pro 500 only). If you chose Ultrafast and switch to a model without it, requests go out on the standard tier; the plugin never substitutes Fast for you. It is the fastest tier and uses allowance and Credits faster. It stays Beta because it has not been run on a Pro 500 account yet.

### Ultra proactive delegation

Supported models offer **Ultra** in the composer's reasoning-effort menu. You can also choose it under **Settings → Codex subscription → Models → Default reasoning effort**. Availability depends on the current account's model catalog, the host's runtime-context and tool-policy services, and a usable native subagent tool in the selected Agent preset. The option is hidden when these requirements are not met. With Ultra selected as the default, unsupported models still use their own default reasoning effort.

Ultra is a **DSH proactive delegation preset**: it uses the native reasoning effort resolved from the account's model catalog and guides the model to delegate suitable independent work to native subagents. Real-account acceptance for GPT-6.1-Sol used `xhigh`; the effective effort depends on the catalog, and the literal value `ultra` is never sent as `reasoning.effort`. Simple tasks can still run directly, so selecting Ultra does not guarantee a subagent on every request. Additional subtasks can increase usage and completion time.

Subagents retain DSH's existing approvals, sandbox, concurrency and depth limits, and cancellation controls. Ultra grants no additional permissions and does not install components or change Agent presets automatically. Switching to an ordinary effort removes the Ultra delegation policy from subsequent requests; restoring a session rechecks capabilities and the current request's permissions.

**Acceptance coverage:** real-account tests on the full DSH **0.2.1-rc.3** host verified GPT-6.1-Sol completing a native subtask, cancellation, restoring Ultra and switching back to High. Selecting Ultra in the iPhone menu has not yet been confirmed on the device. This is a DSH execution preset, not a claim to reproduce the official client's entire orchestration.

<a id="phone"></a>

### Phone remote control (Beta)

Turn it on under **Settings → Codex subscription → Phone & more → Phone remote control** and this computer's DSH appears in the ChatGPT mobile app's Codex host list. Press Generate pairing code, then scan the QR code or type the manual code in the app; the code lasts about 10 minutes.

- From the phone you can browse history, start and continue conversations, interrupt, queue, fork, archive and unarchive conversations, and switch model (including DeepSeek and other third-party models), reasoning level and permissions (workspace write / full access).
- DSH workspaces appear as projects on the phone, and a new chat can start in one; usage limits, plan and context usage are shown too.
- Replies appear as they are written; commands, file edits (with diffs), the task list and generated images use the phone's native views.
- You can send photos from the phone (with or without text) when the selected model reads images, and the folder picker browses real folders on the computer.
- On the phone, `@` searches files in the conversation's folder and `/` picks a DSH skill.
- Conversations can be searched by title (and by message text when DSH has its message index on), keywords can be found inside an opened conversation and jumped to, and the phone's usage page shows your Codex lifetime usage and daily heatmap.
- The changes view works: the phone's requests run only inside the conversation's folder, and only a short list of read-only git commands (status, diff, log, ...) is allowed; everything else is refused.
- After a dropped connection, what the phone has not acknowledged is sent again on reconnect; a half-dead connection (sleep, network switch) is noticed within about a minute and reconnected.
- Settings lists the paired phones and lets you remove any of them.
- When DSH needs a tool approval or asks you a question, the phone shows the choices; if the phone dropped, reopening the conversation within two minutes asks again, otherwise the computer handles it.
- Model errors (missing key, exhausted quota, ...) are shown on the phone.
- Only a host identifier is stored locally; pairing credentials are never written to disk, and turning the switch off disconnects.
- This feature is a third-party host compatibility layer built on the Codex Remote Control protocol and uses OpenAI's remote connection service. Connecting DSH as a third-party host is not something OpenAI has explicitly committed to support and may be affected by later service updates, hence Beta. It does not mean OpenAI has certified or endorsed it. For safety the phone cannot run arbitrary commands on the computer, only the read-only git described above.

<a id="reuse-cache-when-changing-effort"></a>

### Reuse cache when changing effort

**Reuse cache when changing effort** is under **Settings → Codex → Models → Advanced**. It is on by default and can be turned off; saved Off choices are preserved. It applies only to standard, single-agent models explicitly supported by the current account catalog; support is never inferred from model names. Ordinary prompt caching is automatic and still works when this switch is off.

The request-level `reasoning.effort` stays at the current context window's initial value. Changes are recorded as `configuration_update` items in new history and replayed in their original positions. This can reduce cache invalidation when switching effort; it does not guarantee cache hits, faster replies or quota savings. The response-level effort can still report the initial value.

- **Cloud auto-compaction and Unlimited retries disable this feature.** The UI explains the conflict; your compaction, retry, authentication, connection and cache-key settings are never changed automatically.
- Successful responses save small, text-free state alongside DSH's existing replay metadata for restart, resume and forks. Successful local compaction changes the prefix; after checking DSH's committed history replacement, the plugin establishes a fresh baseline at the selected effort. Failed compaction keeps the previous state.
- Enabling an existing chat or returning to a supported model establishes a baseline only when the complete input matches DSH's native session history. The first request may lose the old cache. Unverifiable history, unsupported models, account changes and resource limits use ordinary requests with your selected effort.
- The same-process pending state freezes an already dispatched input even if it fails or is cancelled. Selecting a different effort for that exact retry reports an error; keep its original effort or send a new message. Failed attempts have no durable successful-response checkpoint, so preserving their cache prefix across a process restart or plugin reload is not guaranteed.
- Disabling restores ordinary requests without retrofitting updates into old logs. Update history is never sent to `/responses/compact`. Pro, multi-agent, automatic truncation and automatic compaction are not supported.
- The feature is bounded to 20,000 input items, 16 MiB of fingerprinted input/envelope data, 128 updates and 256 active/pending sessions. Boundary or history validation failures stop preservation, not your selected reasoning effort.

This uses configuration updates documented in OpenAI's [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning); see [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) for cache requirements. Support follows the current account catalog and actual responses. Backend parameter rejections are surfaced, never retried with an old effort or an API key.

### Dedicated Codex SSE proxy

For an advanced network setup, set `DSH_CODEX_SSE_PROXY` to a trusted HTTP or HTTPS CONNECT proxy, such as `http://127.0.0.1:8787`, in the environment that launches DSH. Restart DSH after changing it. When set, it takes precedence over the general proxy and `NO_PROXY` for Codex model SSE. An invalid or unreachable proxy fails the affected request.

Sign-in, usage, phone remote control, and WebSocket keep their existing routes. Normally leave the variable unset: model SSE follows the host/SDK fetch middleware, with the ordinary proxy applied below fetch. A middleware's local handoff is not sent through the external proxy. If that middleware forwards through another process, that process owns its upstream proxy settings; a successful local handoff does not prove which upstream exit it used. The explicit variable selects a dedicated transport instead of this normal fetch chain. If a local proxy inspects TLS, configure its CA using the proxy’s instructions.


### Advanced experiments

Opt in under **Models → Advanced**. SSE and DSH subtasks remain the defaults:

- Set **Input image detail** under **Settings → Codex subscription → Models**. It defaults to Auto; higher detail uses more input tokens.
- Set **Stream inactivity timeout** in the same area (default: 10 minutes). It limits time without streamed data, not the overall response duration; lower values may interrupt slow but valid reasoning and hand the request to DSH retry handling.
- **WebSocket** reuses connections and eligible context transfers. Failed handshakes can fall back to SSE; interrupted responses surface an error without automatic replay. Applies to the next request, does not expand context limits, and is not guaranteed to be faster.
- **Codex independent subtasks** reuse your subscription login and the official DSH Codex provider. Prepare the optional runtime as described below. Subtasks inherit the current subscription model and workspace permissions by default. Turn on model selection under Plugins → Subagent, tick the allowed models and start a new session to specify the child model and reasoning effort in chat. Non-subscription sessions must explicitly select a subscription model. Shared-context subtasks remain with DSH. A Codex subtask gets the workspace tools only: the apps connected to your ChatGPT account (calendar, site deploys and so on), plugin installs and browser or computer control are switched off, because the subtask runs with automatic approval.

<a id="codex-subtask-runtime"></a>

## Optional Codex subtask runtime

### Installation, disabling and removal

Subscription chat, images, and native DSH subtasks do not need Codex CLI. Only **Codex independent subtasks (Beta)** require the optional official runtime. The plugin never downloads it in the background.

Install **Codex Subagent** from the official entries in DSH's **Plugins** page. If you only use it with your subscription, switch the official entry off after installation to leave the package installed and its standalone tool disabled.

In **Settings → Codex subscription → Web & tools**, click **Prepare CLI** under **Independent subtasks**, restart DSH, then choose **Codex (subscription)**. The dedicated CLI uses the profile dependency alias `dsh-codex-subtask-cli` and keeps your subscription login and saved child defaults.

On Windows, the dedicated CLI prefers Codex's MXC sandbox when supported by the device and policy. Otherwise it needs Codex's configured legacy Windows sandbox. Subtasks retain the DSH session's file policy; the plugin does not fall back to unrestricted execution when sandbox setup is unavailable.

### Manual installation and offline preparation

Use the same profile as the subscription plugin. For DSH `0.2.2-rc.1`, the exact-version terminal commands are below. On another supported host, replace only the DSH adapter version with that host's version; do not substitute `@next`.

```sh
dsh plugin --profile web add @deepseek-ai/dsh-subagent-codex@0.2.2-rc.1
dsh plugin --profile web add dsh-codex-subtask-cli@npm:@openai/codex@0.167.0 --save-exact --ignore-scripts
```

The CLI alias is a plain dependency, not a plugin to enable. Restart afterwards. Offline preparation requires a complete runtime installed and verified on the target OS and architecture; copying only the subscription plugin or Codex launcher is insufficient. Model requests still need connectivity.

### When you no longer need it

To stop using the subscription for subtasks, choose **DSH** under **Independent subtasks**. After any running child finishes, remove **Codex Subagent** from DSH's Plugins page if you no longer use it. To remove the subscription-only CLI as well, run the command below with the corresponding profile, then restart DSH.

```sh
dsh plugin --profile web remove dsh-codex-subtask-cli
```

Subscription chat, image generation and native DSH subtasks work without these optional components.

### Storage and cleanup

Uninstalling does not clear shared package caches or guarantee a fixed amount of reclaimed space. DSH or Portable manages those caches centrally; this plugin does not delete shared directories. Sketches, conversation history, generated originals and sign-in data are not package caches. Use their respective management controls when you want to remove them.

**Storage and cache** under Maintenance shows the quota forecast cache size and lets you confirm clearing its local history. New samples are required afterwards; server quotas do not change. Support diagnostics include observed WebSocket connection, reuse and fallback counts, plus cloud compaction checkpoint saves and reuse. These counters exclude response bodies and session identifiers and do not establish a performance improvement.

