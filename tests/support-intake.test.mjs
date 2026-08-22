import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const issueForm = new URL("../.github/ISSUE_TEMPLATE/install-problem.yml", import.meta.url);
const chineseReadme = new URL("../README.md", import.meta.url);
const englishReadme = new URL("../README.md", import.meta.url);

test("bug intake accepts UI failures and requests secret-safe support evidence", async () => {
  const form = await readFile(issueForm, "utf8");

  assert.match(form, /id: dsh_version/);
  assert.match(form, /id: plugin_version/);
  assert.match(form, /id: diagnostics/);
  assert.match(form, /Support diagnostics/);
  assert.match(form, /excludes credentials and account identifiers/);
  assert.match(form, /浏览器登录或取消 \/ Browser sign-in or cancel/);
  assert.doesNotMatch(form, /v0\.2\.8/);

  const outputBlock = form.match(/  - type: textarea\r?\n    id: output[\s\S]*?(?=\r?\n  - type:|$)/)?.[0];
  assert.ok(outputBlock, "other error output field should exist");
  assert.doesNotMatch(outputBlock, /required: true/);
});

test("both public readmes link directly to the guided bug report", async () => {
  const [zh, en] = await Promise.all([
    readFile(chineseReadme, "utf8"),
    readFile(englishReadme, "utf8"),
  ]);
  const issueUrl = "https://github.com/WSL043/dsh-codex-subscription/issues/new?template=install-problem.yml";

  assert.match(zh, new RegExp(issueUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(en, new RegExp(issueUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
