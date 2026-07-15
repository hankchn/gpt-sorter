import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { attachPreviewManifest } from "../gpt-sorter/scripts/core.mjs";

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

test("execute requires an audit report path before browser access", () => {
  const result = run(["execute", "--scan", "1"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /requires --out/);
});

test("execute requires a saved preview plan before browser access", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gpt-sorter-"));
  const outPath = path.join(dir, "execute.json");
  const result = run(["execute", "--out", outPath, "--confirm-count", "0"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /requires --plan/);
});

test("execute rejects a plan fingerprint mismatch before browser access", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gpt-sorter-"));
  const planPath = path.join(dir, "preview.json");
  const outPath = path.join(dir, "execute.json");
  const report = attachPreviewManifest({
    ok: true,
    mode: "preview",
    scan: "20",
    filters: {},
    planned: [{ id: "c1", title: "roadmap", previousGizmoId: null, project: "Work", projectId: "g-p-work" }]
  });
  writeFileSync(planPath, JSON.stringify(report));

  const result = run([
    "execute",
    "--plan",
    planPath,
    "--out",
    outPath,
    "--confirm-plan",
    "0".repeat(64)
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /confirm-plan mismatch/);
});

test("execute rejects a modified saved plan before browser access", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gpt-sorter-"));
  const planPath = path.join(dir, "preview.json");
  const outPath = path.join(dir, "execute.json");
  const report = attachPreviewManifest({
    ok: true,
    mode: "preview",
    scan: "20",
    filters: {},
    planned: [{ id: "c1", title: "roadmap", previousGizmoId: null, project: "Work", projectId: "g-p-work" }]
  });
  report.planManifest.items[0].targetGizmoId = "g-p-research";
  writeFileSync(planPath, JSON.stringify(report));

  const result = run([
    "execute",
    "--plan",
    planPath,
    "--out",
    outPath,
    "--confirm-count",
    "1"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /fingerprint/);
});

test("execute refuses to overwrite its source preview plan", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gpt-sorter-"));
  const planPath = path.join(dir, "preview.json");
  const report = attachPreviewManifest({
    ok: true,
    mode: "preview",
    scan: "20",
    filters: {},
    planned: [{ id: "c1", title: "roadmap", previousGizmoId: null, project: "Work", projectId: "g-p-work" }]
  });
  const original = JSON.stringify(report);
  writeFileSync(planPath, original);

  const result = run([
    "execute",
    "--plan",
    planPath,
    "--out",
    planPath,
    "--confirm-plan",
    report.planFingerprint
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /must not overwrite/);
  assert.equal(JSON.stringify(JSON.parse(readFileSync(planPath, "utf8"))), original);
});
