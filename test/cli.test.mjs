import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "gpt-sorter/scripts/gpt_sorter.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8"
  });
}

test("--help succeeds without a mode or browser session", () => {
  const result = run(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /gpt-sorter/);
  assert.match(result.stdout, /preview/);
  assert.match(result.stdout, /execute/);
});

test("preview reports configErrors before connecting to CDP", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gpt-sorter-"));
  const rulesPath = path.join(dir, "bad-rules.json");
  writeFileSync(rulesPath, JSON.stringify({ rules: [{ project: "Work", match: ["["] }], exact: {} }));

  const result = run(["preview", "--rules", rulesPath, "--json"]);

  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.configErrors.join("\n"), /Invalid regex/);
});

test("execute refuses to run without explicit confirmation", () => {
  const result = run(["execute", "--scan", "1"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /confirm-count|confirm-plan/);
});
