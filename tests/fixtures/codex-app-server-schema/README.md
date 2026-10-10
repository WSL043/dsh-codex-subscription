# Codex app-server JSON schemas (subset)

Generated JSON Schemas of the Codex app-server protocol, taken from
[openai/codex](https://github.com/openai/codex) at commit `806d9732c974bc8a51b8317c1bd8985544fe627c`
(`codex-rs/app-server-protocol/schema/json`), licensed under the Apache License 2.0.

Only the responses this plugin's phone remote control answers, plus `ServerNotification` and
`ServerRequest`, are kept. Prose (`description`, `title`, `default`) is stripped and the files are
minified; the structure is unchanged. They let `tests/remote-control-schema.test.mjs` check, offline,
that everything sent to the ChatGPT mobile app has the shape the app decodes.

To refresh: copy the same files from a newer Codex checkout, strip prose, and update the commit above.
