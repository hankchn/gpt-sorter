import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { validateConfig, validatePreviewReport } from "../gpt-sorter/scripts/core.mjs";

const root = path.resolve(import.meta.dirname, "..");

test("bundled rule example is valid", () => {
  const rules = JSON.parse(readFileSync(path.join(root, "gpt-sorter/examples/rules.example.json"), "utf8"));
  const result = validateConfig(rules);
  assert.equal(result.ok, true, result.configErrors.join("\n"));
});

test("preview output example has a valid immutable manifest", () => {
  const report = JSON.parse(readFileSync(path.join(root, "examples/preview-output.example.json"), "utf8"));
  const result = validatePreviewReport(report);
  assert.equal(result.ok, true, result.errors.join("\n"));
});
