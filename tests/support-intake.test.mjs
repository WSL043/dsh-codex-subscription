import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRequire } from 'node:module';

const { parse } = createRequire(import.meta.resolve('@deepseek-ai/dsh-settings'))('yaml');

const issueForm = new URL("../.github/ISSUE_TEMPLATE/install-problem.yml", import.meta.url);
const chineseReadme = new URL("../README.md", import.meta.url);
const englishReadme = new URL("../README.en.md", import.meta.url);

test("bug intake accepts UI failures and requests secret-safe support evidence", async () => {
  const form = parse(await readFile(issueForm, "utf8"));
  const fields = new Map(form.body.filter(field => field.id).map(field => [field.id, field]));
  for (const id of ['dsh_version', 'plugin_version', 'diagnostics']) assert.equal(fields.get(id)?.validations.required, true, id);
  assert.equal(fields.get('diagnostics').type, 'textarea');
  assert.match(fields.get('diagnostics').attributes.description, /unavailable/i);
  assert.match(fields.get('diagnostics').attributes.description, /Do not paste full raw logs/);
  assert.ok(fields.get('stage').attributes.options.includes('Browser sign-in or cancel'));
  assert.ok(fields.has('output'));
  assert.notEqual(fields.get('output').validations?.required, true);
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
