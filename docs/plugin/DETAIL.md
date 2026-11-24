Sign in to ChatGPT under **Start** below, then choose a Codex model in the conversation composer. This page shares its configuration with **Settings → Codex Subscription**.

### Features and where to find them

- **Start** — Manage signed-in accounts, check remaining quota, reset times and forecasts, and configure quota display in the composer.
- **Models** — Choose visible models, reasoning effort, response speed and answer detail. Customize the composer model menu and speed shortcut.
- **Web & tools** — Choose search and page-fetch providers, configure ChatGPT connectors, and select how subtasks run.
- **Create** — Generate or edit images using chat attachments and readable local files as references. Add image comment pins or use the sketch canvas.
- **Phone & more** — Enable voice conversations and remote access from the ChatGPT App. Check connection status and support diagnostics.

### Costs and requirements

- Ordinary Codex chats use your ChatGPT subscription and need no OpenAI API key. Search and page fetching have separate provider choices. Codex uses the subscription service, DeepSeek Search / Fetch API follows its API billing, and HTTP uses DSH’s ordinary page fetching.
- The official Codex subagent backend needs its CLI component, managed from DSH’s Plugins page. Ordinary chat, search and image generation work without an additional Codex CLI installation.
- The model can read permitted local images as references. Closing the image viewer saves comment pins. **Add to composer** inserts their editing instructions into the composer.
- Quota forecasts use saved usage history and change with your pace and activity on other devices. Beta options require enabling and depend on account and platform availability.

[User guide](https://github.com/WSL043/dsh-codex-subscription/blob/main/README.en.md) · [Report an issue](https://github.com/WSL043/dsh-codex-subscription/issues)
