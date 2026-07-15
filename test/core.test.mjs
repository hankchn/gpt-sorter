import assert from "node:assert/strict";
import test from "node:test";

import {
  attachPreviewManifest,
  attachRollbackManifest,
  buildPlan,
  buildWritePreflight,
  classifyConversation,
  isSemanticEmptyTitle,
  mergeMoveResults,
  redactTitles,
  runSequentialMoves,
  suggestRules,
  validateExecuteReport,
  validatePreviewReport,
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
    rules: [{ project: "Research", match: ["research"] }],
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

test("config rejects blank and empty-matching regex patterns", () => {
  const result = validateConfig({
    rules: [{ project: "Work", match: ["", ".*"] }],
    exact: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.configErrors.join("\n"), /blank/);
  assert.match(result.configErrors.join("\n"), /matches an empty title/);
});

test("config rejects exact-title keys that collide after normalization", () => {
  const result = validateConfig({
    rules: [],
    exact: { roadmap: "Work", " roadmap ": "Research" }
  });

  assert.equal(result.ok, false);
  assert.match(result.configErrors.join("\n"), /duplicate normalized title/);
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

test("duplicate project names are skipped instead of resolving to an arbitrary id", () => {
  const config = validConfig({ rules: [{ project: "Work", match: ["roadmap"] }], exact: {} });
  const result = classifyConversation(
    { id: "c1", title: "roadmap", gizmo_id: null },
    { config, projects: [...projects, { id: "g-p-work-2", name: "Work" }] }
  );

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "project-name-ambiguous");
  assert.deepEqual(result.projectIds, ["g-p-work", "g-p-work-2"]);
});

test("multiple matching rules for the same project are merged", () => {
  const config = validConfig({
    rules: [
      { project: "Work", match: ["roadmap"] },
      { project: "Work", match: ["planning"] }
    ],
    exact: {}
  });
  const result = classifyConversation(
    { id: "c1", title: "roadmap planning", gizmo_id: null },
    { config, projects }
  );

  assert.equal(result.status, "planned");
  assert.equal(result.projectId, "g-p-work");
  assert.deepEqual(result.matchedRule.ruleIndexes, [0, 1]);
});

test("preview manifests bind exact ids, source state, target ids, and title hashes", () => {
  const report = attachPreviewManifest({
    ok: true,
    mode: "preview",
    scan: "20",
    filters: {},
    planned: [{ id: "c1", title: "roadmap", previousGizmoId: null, project: "Work", projectId: "g-p-work" }]
  });
  const valid = validatePreviewReport(report);
  assert.equal(valid.ok, true);

  const redacted = redactTitles(report);
  assert.equal(redacted.planned[0].title, null);
  assert.equal(validatePreviewReport(redacted).ok, true);

  const tampered = structuredClone(report);
  tampered.planManifest.items[0].targetGizmoId = "g-p-research";
  const invalid = validatePreviewReport(tampered);
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join("\n"), /fingerprint/);
});

test("write preflight rejects title, source-state, and target-project changes", () => {
  const report = attachPreviewManifest({
    ok: true,
    mode: "preview",
    scan: "all",
    filters: {},
    planned: [
      { id: "title", title: "old title", previousGizmoId: null, project: "Work", projectId: "g-p-work" },
      { id: "state", title: "roadmap", previousGizmoId: null, project: "Work", projectId: "g-p-work" },
      { id: "target", title: "research", previousGizmoId: null, project: "Research", projectId: "missing" }
    ]
  });
  const preflight = buildWritePreflight(report.planManifest, {
    projects,
    conversations: [
      { id: "title", title: "new title", gizmo_id: null },
      { id: "state", title: "roadmap", gizmo_id: "g-p-research" },
      { id: "target", title: "research", gizmo_id: null }
    ]
  });

  assert.equal(preflight.eligible.length, 0);
  assert.deepEqual(
    preflight.errors.map((item) => item.reason).sort(),
    ["title-changed", "project-state-changed", "target-project-missing"].sort()
  );
});

test("rollback manifests are fingerprinted and only restore unchanged execution state", () => {
  const executeReport = attachRollbackManifest({
    mode: "execute",
    moves: [
      {
        id: "c1",
        title: "roadmap",
        titleHash: attachPreviewManifest({
          scan: "1",
          filters: {},
          planned: [{ id: "c1", title: "roadmap", previousGizmoId: null, project: "Work", projectId: "g-p-work" }]
        }).planManifest.items[0].titleHash,
        previousGizmoId: null,
        targetGizmoId: "g-p-work",
        project: "Work",
        status: "moved"
      }
    ]
  });
  assert.equal(validateExecuteReport(executeReport).ok, true);

  const unchanged = buildWritePreflight(executeReport.rollbackManifest, {
    projects,
    conversations: [{ id: "c1", title: "roadmap", gizmo_id: "g-p-work" }]
  });
  assert.equal(unchanged.eligible.length, 1);
  assert.equal(unchanged.eligible[0].targetGizmoId, null);

  const changed = buildWritePreflight(executeReport.rollbackManifest, {
    projects,
    conversations: [{ id: "c1", title: "roadmap", gizmo_id: "g-p-research" }]
  });
  assert.equal(changed.eligible.length, 0);
  assert.equal(changed.errors[0].reason, "project-state-changed");
});

test("move result merging keeps successful errors null and marks missing results failed", () => {
  const moves = [
    { id: "ok", title: "one", previousGizmoId: null, targetGizmoId: "g-p-work", project: "Work", projectId: "g-p-work", titleHash: "a" },
    { id: "missing", title: "two", previousGizmoId: null, targetGizmoId: "g-p-work", project: "Work", projectId: "g-p-work", titleHash: "b" }
  ];
  const merged = mergeMoveResults(moves, [{ id: "ok", status: "moved", httpStatus: 200, error: null }]);

  assert.equal(merged[0].status, "moved");
  assert.equal(merged[0].error, null);
  assert.equal(merged[1].status, "failed");
  assert.match(merged[1].error, /No result returned/);
});

test("sequential writes checkpoint each item and stop after the first failure", async () => {
  const calls = [];
  const checkpoints = [];
  const result = await runSequentialMoves({
    moves: [{ id: "one" }, { id: "two" }, { id: "three" }],
    executeOne: async (move) => {
      calls.push(move.id);
      return move.id === "two"
        ? { id: move.id, status: "failed", httpStatus: 500, error: "server error" }
        : { id: move.id, status: "moved", httpStatus: 200, error: null };
    },
    onProgress: async (items) => checkpoints.push(items.map((item) => item.id)),
    delayMs: 1,
    sleep: async () => {}
  });

  assert.deepEqual(calls, ["one", "two"]);
  assert.deepEqual(checkpoints, [["one"], ["one", "two"]]);
  assert.equal(result.error, "server error");
  assert.equal(result.uncertainMove, null);
});

test("sequential writes preserve completed results when the next write is uncertain", async () => {
  const result = await runSequentialMoves({
    moves: [{ id: "one" }, { id: "two" }],
    executeOne: async (move) => {
      if (move.id === "two") throw new Error("connection lost");
      return { id: move.id, status: "moved", httpStatus: 200, error: null };
    }
  });

  assert.deepEqual(result.results.map((item) => item.id), ["one"]);
  assert.equal(result.error, "connection lost");
  assert.equal(result.uncertainMove.id, "two");
});

test("suggest-rules reports coverage without persisting title samples by default", () => {
  const draft = suggestRules({
    projects,
    conversations: [
      { id: "c1", title: "Work roadmap" },
      { id: "c2", title: "unrelated topic" }
    ]
  });

  assert.equal(draft.rules.some((rule) => Object.hasOwn(rule, "sampleTitles")), false);
  assert.equal(draft._meta.titleSamplesIncluded, false);
  assert.equal(draft._meta.coverage.planned, 1);
  assert.equal(draft._meta.coverage.unmatched, 1);

  const withSamples = suggestRules({
    projects,
    conversations: [{ id: "c1", title: "Work roadmap" }],
    includeTitleSamples: true
  });
  assert.deepEqual(withSamples.rules[0].sampleTitles, ["Work roadmap"]);
});
