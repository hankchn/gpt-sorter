import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlan,
  classifyConversation,
  isSemanticEmptyTitle,
  validateConfig
} from "../gpt-sorter/scripts/core.mjs";

const projects = [
  { id: "g-p-work", name: "Work" },
  { id: "g-p-research", name: "Research" }
];

function validConfig(raw) {
  const result = validateConfig(raw);
  assert.deepEqual(result.configErrors, []);
  return result.config;
}

test("validateConfig reports schema and regex errors without throwing", () => {
  const result = validateConfig({
    rules: [
      { project: "", match: ["ok"] },
      { project: "Work", match: "roadmap" },
      { project: "Research", match: ["["] }
    ],
    exact: []
  });

  assert.equal(result.ok, false);
  assert.match(result.configErrors.join("\n"), /project/);
  assert.match(result.configErrors.join("\n"), /match/);
  assert.match(result.configErrors.join("\n"), /Invalid regex/);
  assert.match(result.configErrors.join("\n"), /exact/);
});

test("isSemanticEmptyTitle catches empty, untitled, New chat, and very short titles", () => {
  assert.equal(isSemanticEmptyTitle(""), true);
  assert.equal(isSemanticEmptyTitle("   "), true);
  assert.equal(isSemanticEmptyTitle("New chat"), true);
  assert.equal(isSemanticEmptyTitle("Untitled"), true);
  assert.equal(isSemanticEmptyTitle("AI"), true);
  assert.equal(isSemanticEmptyTitle("roadmap planning"), false);
});

test("exact title mapping has priority and can override semantic-empty protection", () => {
  const config = validConfig({
    rules: [{ project: "Research", match: [".*"] }],
    exact: { "New chat": "Work" }
  });

  const result = classifyConversation(
    { id: "c1", title: "New chat", gizmo_id: null },
    { config, projects }
  );

  assert.equal(result.status, "planned");
  assert.equal(result.project, "Work");
  assert.equal(result.projectId, "g-p-work");
});

test("multiple non-exact rule matches are skipped as ambiguous with candidate projects", () => {
  const config = validConfig({
    rules: [
      { project: "Work", match: ["roadmap"] },
      { project: "Research", match: ["analysis"] }
    ],
    exact: {}
  });

  const plan = buildPlan({
    conversations: [{ id: "c1", title: "roadmap analysis", gizmo_id: null }],
    projects,
    config
  });

  assert.equal(plan.plannedCount, 0);
  assert.equal(plan.skipped[0].reason, "ambiguous-multiple-rules");
  assert.deepEqual(plan.skipped[0].candidateProjects, ["Work", "Research"]);
});

test("semantic-empty titles are skipped before broad regex rules", () => {
  const config = validConfig({
    rules: [{ project: "Work", match: [".*"] }],
    exact: {}
  });

  const plan = buildPlan({
    conversations: [{ id: "c1", title: "New chat", gizmo_id: null }],
    projects,
    config
  });

  assert.equal(plan.plannedCount, 0);
  assert.equal(plan.skipped[0].reason, "semantic-empty-title");
});

test("missing target projects are skipped instead of planned", () => {
  const config = validConfig({
    rules: [{ project: "Missing", match: ["roadmap"] }],
    exact: {}
  });

  const plan = buildPlan({
    conversations: [{ id: "c1", title: "roadmap", gizmo_id: null }],
    projects,
    config
  });

  assert.equal(plan.plannedCount, 0);
  assert.equal(plan.skipped[0].reason, "project-missing");
  assert.equal(plan.skipped[0].project, "Missing");
});

test("already-in-project conversations are skipped by default", () => {
  const config = validConfig({
    rules: [{ project: "Work", match: ["roadmap"] }],
    exact: {}
  });

  const plan = buildPlan({
    conversations: [{ id: "c1", title: "roadmap", gizmo_id: "g-p-research" }],
    projects,
    config
  });

  assert.equal(plan.plannedCount, 0);
  assert.equal(plan.skipped[0].reason, "already-in-project");
});

test("rule matching is case-insensitive", () => {
  const config = validConfig({
    rules: [{ project: "Work", match: ["roadmap"] }],
    exact: {}
  });

  const plan = buildPlan({
    conversations: [{ id: "c1", title: "ROADMAP review", gizmo_id: null }],
    projects,
    config
  });

  assert.equal(plan.plannedCount, 1);
  assert.equal(plan.planned[0].project, "Work");
});
