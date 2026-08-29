import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const issueForm = new URL("../.github/ISSUE_TEMPLATE/install-problem.yml", import.meta.url);
const featureForm = new URL("../.github/ISSUE_TEMPLATE/feature-request.yml", import.meta.url);
const chineseReadme = new URL("../README.md", import.meta.url);
const englishReadme = new URL("../README.en.md", import.meta.url);
const acknowledgementWorkflow = new URL("../.github/workflows/issue-intake.yml", import.meta.url);

test("bug intake accepts UI failures and requests secret-safe support evidence", async () => {
  const form = await readFile(issueForm, "utf8");

  assert.match(form, /id: dsh_version/);
  assert.match(form, /id: plugin_version/);
  assert.match(form, /id: diagnostics/);
  assert.match(form, /Support diagnostics/);
  assert.match(form, /excludes credentials and account identifiers/);
  const diagnosticsBlock = form.match(/  - type: textarea\r?\n    id: diagnostics[\s\S]*?(?=\r?\n  - type:|$)/)?.[0];
  assert.ok(diagnosticsBlock, "support diagnostics field should exist");
  assert.match(diagnosticsBlock, /required: true/);
  assert.match(diagnosticsBlock, /unavailable/i);
  assert.match(diagnosticsBlock, /Do not paste full raw logs/);
  assert.match(form, /Browser sign-in or cancel/);
  assert.doesNotMatch(form, /使用问题|问题|\/[ ]*(?:Bug report|System|Use case)/u);
  assert.doesNotMatch(form, /^title:/mu);
  assert.doesNotMatch(form, /v0\.2\.8/);

  const outputBlock = form.match(/  - type: textarea\r?\n    id: output[\s\S]*?(?=\r?\n  - type:|$)/)?.[0];
  assert.ok(outputBlock, "other error output field should exist");
  assert.doesNotMatch(outputBlock, /required: true/);
});

test('issue forms default to concise English without forced title prefixes', async () => {
  const [bug, feature] = await Promise.all([readFile(issueForm, 'utf8'), readFile(featureForm, 'utf8')]);
  for (const form of [bug, feature]) {
    assert.doesNotMatch(form, /^title:/mu);
    assert.doesNotMatch(form, /功能建议|使用场景|希望怎样工作|提交前确认/u);
  }
  assert.match(bug, /^name: Bug report$/mu);
  assert.match(feature, /^name: Feature request$/mu);
});

test("bug issues receive one acknowledgement and bounded version guidance on open or edit", async () => {
  const workflow = await readFile(acknowledgementWorkflow, "utf8");
  assert.match(workflow, /issues:\s*write/);
  assert.match(workflow, /types:\s*\[opened, edited\]/);
  assert.match(workflow, /dsh-maintenance-ack/);
  assert.match(workflow, /dsh-version-check/);
  assert.match(workflow, /### Plugin version/);
  assert.match(workflow, /registry\.npmjs\.org\/dsh-codex-subscription\/latest/);
  assert.match(workflow, /github\.rest\.issues\.createComment/);
  assert.match(workflow, /reviewed against the supported release/);
  assert.doesNotMatch(workflow, /schedule:|close|state:\s*closed|merge/i);
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
