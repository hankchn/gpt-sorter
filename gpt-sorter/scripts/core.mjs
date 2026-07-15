import { createHash } from "node:crypto";

export const DEFAULT_CONFIG = {
  rules: [
    { project: "工作", match: ["会议", "路线图", "需求", "复盘", "项目"] },
    { project: "学习", match: ["课程", "笔记", "教程", "概念", "练习"] },
    { project: "研究", match: ["调研", "资料", "对比", "分析", "报告"] },
    { project: "写作", match: ["草稿", "大纲", "标题", "改写", "润色"] },
    { project: "灵感", match: ["想法", "创意", "设计", "方案", "头脑风暴"] },
    { project: "事务", match: ["清单", "安排", "提醒", "日程", "表格"] }
  ],
  exact: {}
};

const SEMANTIC_EMPTY_TITLES = new Set(["new chat", "untitled"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeTitle(title) {
  return String(title ?? "").trim();
}

export function isSemanticEmptyTitle(title) {
  const normalized = normalizeTitle(title);
  if (!normalized) return true;
  if (SEMANTIC_EMPTY_TITLES.has(normalized.toLocaleLowerCase())) return true;
  return Array.from(normalized.replace(/\s+/g, "")).length <= 2;
}

export function validateConfig(rawConfig = DEFAULT_CONFIG) {
  const configErrors = [];
  const config = { rules: [], exact: {} };

  if (!isPlainObject(rawConfig)) {
    return {
      ok: false,
      config: null,
      configErrors: ["Config must be a JSON object."]
    };
  }

  if (!Array.isArray(rawConfig.rules)) {
    configErrors.push("Config field `rules` must be an array.");
  } else {
    rawConfig.rules.forEach((rule, ruleIndex) => {
      if (!isPlainObject(rule)) {
        configErrors.push(`rules[${ruleIndex}] must be an object.`);
        return;
      }

      const project = typeof rule.project === "string" ? rule.project.trim() : "";
      if (!project) {
        configErrors.push(`rules[${ruleIndex}].project must be a non-empty string.`);
      }

      if (!Array.isArray(rule.match) || !rule.match.every((item) => typeof item === "string")) {
        configErrors.push(`rules[${ruleIndex}].match must be an array of strings.`);
        return;
      }

      const matchers = [];
      rule.match.forEach((pattern, patternIndex) => {
        if (!pattern.trim()) {
          configErrors.push(`rules[${ruleIndex}].match[${patternIndex}] must not be blank.`);
          return;
        }
        try {
          const matcher = new RegExp(pattern, "i");
          if (matcher.test("")) {
            configErrors.push(
              `rules[${ruleIndex}].match[${patternIndex}] (${JSON.stringify(pattern)}) matches an empty title; use a narrower pattern.`
            );
            return;
          }
          matchers.push(matcher);
        } catch (error) {
          configErrors.push(
            `Invalid regex at rules[${ruleIndex}].match[${patternIndex}] (${JSON.stringify(pattern)}): ${error.message}`
          );
        }
      });

      config.rules.push({
        project,
        match: [...rule.match],
        matchers
      });
    });
  }

  if (rawConfig.exact === undefined) {
    config.exact = {};
  } else if (!isPlainObject(rawConfig.exact)) {
    configErrors.push("Config field `exact` must be an object mapping title to project.");
  } else {
    Object.entries(rawConfig.exact).forEach(([title, project]) => {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        configErrors.push("exact mappings must not use an empty title.");
        return;
      }
      if (typeof project !== "string" || !project.trim()) {
        configErrors.push(`exact[${JSON.stringify(title)}] must map to a non-empty project string.`);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(config.exact, normalizedTitle)) {
        configErrors.push(`exact contains duplicate normalized title ${JSON.stringify(normalizedTitle)}.`);
        return;
      }
      config.exact[normalizedTitle] = project.trim();
    });
  }

  return {
    ok: configErrors.length === 0,
    config: configErrors.length === 0 ? config : null,
    configErrors
  };
}

export function projectMap(projects) {
  const index = projectIndex(projects);
  return new Map(
    [...index.entries()]
      .filter(([, matches]) => matches.length === 1)
      .map(([name, matches]) => [name, matches[0].id])
  );
}

export function projectIndex(projects) {
  const index = new Map();
  for (const project of projects || []) {
    if (!project?.id || !project?.name) continue;
    const name = String(project.name).trim();
    if (!name) continue;
    const matches = index.get(name) || [];
    matches.push({ id: project.id, name });
    index.set(name, matches);
  }
  return index;
}

function resolveProject(projectsByName, project) {
  const matches = projectsByName.get(project) || [];
  if (matches.length === 0) return { status: "missing", project };
  if (matches.length > 1) {
    return {
      status: "ambiguous",
      project,
      projectIds: matches.map((item) => item.id)
    };
  }
  return { status: "resolved", project, projectId: matches[0].id };
}

function baseConversation(conversation) {
  return {
    id: conversation?.id ?? null,
    title: normalizeTitle(conversation?.title),
    previousGizmoId: conversation?.gizmo_id ?? conversation?.gizmo?.id ?? conversation?.previousGizmoId ?? null,
    isArchived: Boolean(conversation?.is_archived ?? conversation?.isArchived ?? false),
    isStarred: Boolean(conversation?.is_starred ?? conversation?.isStarred ?? false)
  };
}

function skipped(conversation, reason, extra = {}) {
  return {
    status: "skipped",
    id: conversation.id,
    title: conversation.title,
    previousGizmoId: conversation.previousGizmoId,
    reason,
    ...extra
  };
}

function planned(conversation, project, projectId, extra = {}) {
  return {
    status: "planned",
    id: conversation.id,
    title: conversation.title,
    previousGizmoId: conversation.previousGizmoId,
    project,
    projectId,
    ...extra
  };
}

export function classifyConversation(conversationInput, { config, projects, includeInProject = false } = {}) {
  const conversation = baseConversation(conversationInput);
  const projectsByName = projectIndex(projects);

  if (conversation.previousGizmoId && !includeInProject) {
    return skipped(conversation, "already-in-project");
  }

  const hasExact = Object.prototype.hasOwnProperty.call(config.exact, conversation.title);
  if (hasExact) {
    const project = config.exact[conversation.title];
    const resolution = resolveProject(projectsByName, project);
    if (resolution.status === "missing") return skipped(conversation, "project-missing", { project, source: "exact" });
    if (resolution.status === "ambiguous") {
      return skipped(conversation, "project-name-ambiguous", {
        project,
        projectIds: resolution.projectIds,
        source: "exact"
      });
    }
    const projectId = resolution.projectId;
    if (conversation.previousGizmoId === projectId) return skipped(conversation, "already-target-project", { project, projectId });
    return planned(conversation, project, projectId, { source: "exact" });
  }

  if (isSemanticEmptyTitle(conversation.title)) {
    return skipped(conversation, "semantic-empty-title");
  }

  const matchedRules = config.rules
    .map((rule, ruleIndex) => ({
      ruleIndex,
      project: rule.project,
      matchedPatterns: rule.match.filter((pattern, patternIndex) => rule.matchers[patternIndex]?.test(conversation.title))
    }))
    .filter((match) => match.matchedPatterns.length > 0);

  if (matchedRules.length === 0) {
    return skipped(conversation, "no-confident-project");
  }

  const candidateProjects = [...new Set(matchedRules.map((match) => match.project))];
  if (candidateProjects.length > 1) {
    return skipped(conversation, "ambiguous-multiple-rules", {
      candidateProjects,
      matchedRules: matchedRules.map(({ ruleIndex, project, matchedPatterns }) => ({ ruleIndex, project, matchedPatterns }))
    });
  }

  const project = candidateProjects[0];
  const resolution = resolveProject(projectsByName, project);
  if (resolution.status === "missing") {
    return skipped(conversation, "project-missing", { project });
  }
  if (resolution.status === "ambiguous") {
    return skipped(conversation, "project-name-ambiguous", {
      project,
      projectIds: resolution.projectIds
    });
  }
  const projectId = resolution.projectId;
  if (conversation.previousGizmoId === projectId) {
    return skipped(conversation, "already-target-project", { project, projectId });
  }

  return planned(conversation, project, projectId, {
    source: "rule",
    matchedRule: {
      ruleIndexes: matchedRules.map((match) => match.ruleIndex),
      matchedPatterns: [...new Set(matchedRules.flatMap((match) => match.matchedPatterns))]
    }
  });
}

export function buildPlan({ conversations = [], projects = [], config, includeInProject = false, projectPagination = null } = {}) {
  const classifications = conversations.map((conversation) =>
    classifyConversation(conversation, { config, projects, includeInProject })
  );
  const plannedItems = classifications.filter((item) => item.status === "planned");
  const skippedItems = classifications.filter((item) => item.status === "skipped");

  return {
    scanned: conversations.length,
    projectCount: projects.length,
    projectPagination,
    plannedCount: plannedItems.length,
    skippedCount: skippedItems.length,
    byProject: countBy(plannedItems, "project"),
    skippedByReason: countBy(skippedItems, "reason"),
    planned: plannedItems,
    skipped: skippedItems
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "unknown";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function previewList(items, maxItems) {
  return items.slice(0, maxItems);
}

export function formatHumanReport(report, { maxPreviewItems = 20 } = {}) {
  if (report.configErrors?.length) {
    return [
      "Configuration errors:",
      ...report.configErrors.map((error) => `- ${error}`),
      "",
      "No preview or execution was performed."
    ].join("\n");
  }

  if (!report.ok) {
    const lines = [`Failed: ${report.error || "unknown error"}`];
    const details = report.preflightErrors || report.planErrors || [];
    if (details.length) {
      lines.push("", "Details:");
      details.slice(0, maxPreviewItems).forEach((item) => {
        lines.push(`- ${typeof item === "string" ? item : `${item.title || item.id || "item"}: ${item.reason || "invalid"}`}`);
      });
    }
    return lines.join("\n");
  }

  const lines = [
    `Mode: ${report.mode}`,
    `Scanned: ${report.scanned ?? 0}`,
    `Projects: ${report.projectCount ?? 0}${report.projectPagination?.truncated ? " (possibly truncated)" : ""}`,
    `Planned: ${report.plannedCount ?? 0}`,
    `Skipped: ${report.skippedCount ?? 0}`
  ];

  if (report.movedCount !== undefined) lines.push(`Moved: ${report.movedCount}`);
  if (report.restoredCount !== undefined) lines.push(`Restored: ${report.restoredCount}`);
  if (report.failedCount !== undefined) lines.push(`Failed moves: ${report.failedCount}`);
  if (report.eligibleCount !== undefined) lines.push(`Eligible after preflight: ${report.eligibleCount}`);

  if (report.configWarnings?.length) {
    lines.push("", "Warnings:");
    report.configWarnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  if (report.ruleCoverage) {
    lines.push(
      "",
      `Rule coverage: planned=${report.ruleCoverage.planned}, unmatched=${report.ruleCoverage.unmatched}, ambiguous=${report.ruleCoverage.ambiguous}`
    );
  }

  if (report.planFingerprint) lines.push("", `Plan fingerprint: ${report.planFingerprint}`);
  if (report.rollbackFingerprint) lines.push(`Rollback fingerprint: ${report.rollbackFingerprint}`);

  const byProject = report.byProject || {};
  if (Object.keys(byProject).length) {
    lines.push("", "Planned by project:");
    Object.entries(byProject).forEach(([project, count]) => lines.push(`- ${project}: ${count}`));
  }

  const skippedByReason = report.skippedByReason || {};
  if (Object.keys(skippedByReason).length) {
    lines.push("", "Skipped by reason:");
    Object.entries(skippedByReason).forEach(([reason, count]) => lines.push(`- ${reason}: ${count}`));
  }

  const plannedSample = previewList(report.planned || [], maxPreviewItems);
  if (plannedSample.length) {
    lines.push("", `Planned sample (${plannedSample.length}/${report.plannedCount}):`);
    plannedSample.forEach((item) => lines.push(`- ${item.title || "(empty title)"} -> ${item.project}`));
  }

  const skippedSample = previewList(report.skipped || [], maxPreviewItems);
  if (skippedSample.length) {
    lines.push("", `Skipped sample (${skippedSample.length}/${report.skippedCount}):`);
    skippedSample.forEach((item) => {
      const candidates = item.candidateProjects?.length ? ` candidates=${item.candidateProjects.join(", ")}` : "";
      const project = item.project ? ` project=${item.project}` : "";
      lines.push(`- ${item.title || "(empty title)"}: ${item.reason}${project}${candidates}`);
    });
  }

  if (report.outputFile) {
    lines.push("", `Report written: ${report.outputFile}`);
  }

  return lines.join("\n");
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordCandidates(projectName) {
  const normalized = normalizeTitle(projectName);
  const parts = normalized
    .split(/[\s/_-]+/u)
    .map((part) => part.trim())
    .filter((part) => Array.from(part).length > 2);
  return [...new Set([normalized, ...parts].filter(Boolean).map(escapeRegex))];
}

export function suggestRules({ projects = [], conversations = [], maxTitles = 100, includeTitleSamples = false } = {}) {
  const recentTitles = conversations.slice(0, maxTitles).map((conversation) => normalizeTitle(conversation.title)).filter(Boolean);
  const rules = projects.map((project) => {
    const match = keywordCandidates(project.name);
    const sampleTitles = recentTitles.filter((title) => title.toLocaleLowerCase().includes(project.name.toLocaleLowerCase())).slice(0, 5);
    const rule = {
      project: project.name,
      match
    };
    if (includeTitleSamples) rule.sampleTitles = sampleTitles;
    return rule;
  });

  const validation = validateConfig({ rules, exact: {} });
  const coveragePlan = validation.ok
    ? buildPlan({ conversations: conversations.slice(0, maxTitles), projects, config: validation.config })
    : null;

  return {
    rules,
    exact: {},
    _meta: {
      generatedBy: "gpt-sorter suggest-rules",
      projectCount: projects.length,
      scannedTitleCount: recentTitles.length,
      titleSamplesIncluded: includeTitleSamples,
      coverage: coveragePlan
        ? {
            planned: coveragePlan.plannedCount,
            skipped: coveragePlan.skippedCount,
            ambiguous: coveragePlan.skippedByReason["ambiguous-multiple-rules"] || 0,
            unmatched: coveragePlan.skippedByReason["no-confident-project"] || 0
          }
        : null,
      note: "Review and edit this draft before using it with preview or execute."
    }
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function redactTitles(value) {
  if (Array.isArray(value)) return value.map(redactTitles);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      if (key === "title") return [key, null];
      if (key === "sampleTitles") return [key, []];
      return [key, redactTitles(item)];
    })
  );
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

export function titleHash(title) {
  return sha256(normalizeTitle(title));
}

export function fingerprintManifest(manifest) {
  return sha256(JSON.stringify(stableValue(manifest)));
}

export function createPreviewManifest({ scan, filters = {}, planned = [] } = {}) {
  const items = planned
    .map((item) => ({
      id: item.id,
      previousGizmoId: item.previousGizmoId ?? null,
      targetGizmoId: item.projectId,
      project: item.project,
      titleHash: titleHash(item.title)
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

  return {
    schemaVersion: 1,
    kind: "gpt-sorter-preview",
    scan: String(scan ?? ""),
    filters: {
      includeArchived: Boolean(filters.includeArchived),
      includeStarred: Boolean(filters.includeStarred),
      includeInProject: Boolean(filters.includeInProject)
    },
    plannedCount: items.length,
    items
  };
}

export function attachPreviewManifest(report) {
  const planManifest = createPreviewManifest(report);
  return {
    ...report,
    plannedCount: planManifest.plannedCount,
    planManifest,
    planFingerprint: fingerprintManifest(planManifest)
  };
}

function validateManifestItems(items, errors, { requirePrevious = false, allowNullTarget = false } = {}) {
  if (!Array.isArray(items)) {
    errors.push("Manifest items must be an array.");
    return;
  }
  const seenIds = new Set();
  items.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`Manifest item ${index} must be an object.`);
      return;
    }
    if (typeof item.id !== "string" || !item.id) errors.push(`Manifest item ${index} has no conversation id.`);
    if (seenIds.has(item.id)) errors.push(`Manifest contains duplicate conversation id ${item.id}.`);
    seenIds.add(item.id);
    const validTarget =
      (allowNullTarget && item.targetGizmoId === null) ||
      (typeof item.targetGizmoId === "string" && Boolean(item.targetGizmoId));
    if (!validTarget) {
      errors.push(`Manifest item ${index} has no target project id.`);
    }
    if (requirePrevious && !Object.prototype.hasOwnProperty.call(item, "previousGizmoId")) {
      errors.push(`Manifest item ${index} has no previous project state.`);
    }
    if (typeof item.titleHash !== "string" || !/^[a-f0-9]{64}$/.test(item.titleHash)) {
      errors.push(`Manifest item ${index} has an invalid title hash.`);
    }
  });
}

export function validatePreviewReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") return { ok: false, errors: ["Preview report must be a JSON object."] };
  if (report.mode !== "preview" || report.ok !== true) errors.push("Plan file must be a successful preview report.");
  const manifest = report.planManifest;
  if (!manifest || manifest.kind !== "gpt-sorter-preview" || manifest.schemaVersion !== 1) {
    errors.push("Plan file has no supported preview manifest.");
  } else {
    validateManifestItems(manifest.items, errors, { requirePrevious: true });
    if (manifest.plannedCount !== manifest.items?.length) errors.push("Preview manifest plannedCount does not match its items.");
    if (report.plannedCount !== manifest.plannedCount) errors.push("Preview report plannedCount does not match its manifest.");
    if (!Array.isArray(report.planned) || report.planned.length !== manifest.items?.length) {
      errors.push("Preview report planned items do not match its manifest.");
    } else {
      const plannedById = new Map(report.planned.map((item) => [item.id, item]));
      for (const item of manifest.items) {
        const displayed = plannedById.get(item.id);
        if (!displayed || displayed.projectId !== item.targetGizmoId ||
            (displayed.previousGizmoId ?? null) !== (item.previousGizmoId ?? null) || displayed.project !== item.project) {
          errors.push(`Preview report item ${item.id} does not match its manifest.`);
          continue;
        }
        if (displayed.title !== null && displayed.title !== undefined && titleHash(displayed.title) !== item.titleHash) {
          errors.push(`Preview report title for ${item.id} does not match its manifest.`);
        }
      }
    }
    const expected = fingerprintManifest(manifest);
    if (report.planFingerprint !== expected) errors.push("Preview plan fingerprint does not match the saved manifest.");
  }
  return { ok: errors.length === 0, errors, manifest, planFingerprint: report.planFingerprint };
}

export function buildWritePreflight(manifest, snapshot) {
  const conversationsById = new Map((snapshot?.conversations || []).map((item) => [item.id, item]));
  const projectsById = new Map((snapshot?.projects || []).map((item) => [item.id, item]));
  const eligible = [];
  const errors = [];

  for (const item of manifest?.items || []) {
    const conversation = conversationsById.get(item.id);
    if (!conversation) {
      errors.push({ id: item.id, reason: "conversation-missing" });
      continue;
    }
    if (titleHash(conversation.title) !== item.titleHash) {
      errors.push({ id: item.id, title: conversation.title, reason: "title-changed" });
      continue;
    }

    const currentGizmoId = conversation.gizmo_id ?? conversation.gizmo?.id ?? null;
    const expectedGizmoId = item.previousGizmoId ?? null;
    if (currentGizmoId !== expectedGizmoId) {
      errors.push({
        id: item.id,
        title: conversation.title,
        reason: "project-state-changed",
        expectedGizmoId,
        currentGizmoId
      });
      continue;
    }

    const targetProject = item.targetGizmoId === null ? null : projectsById.get(item.targetGizmoId);
    if (item.targetGizmoId !== null && !targetProject) {
      errors.push({ id: item.id, title: conversation.title, reason: "target-project-missing", targetGizmoId: item.targetGizmoId });
      continue;
    }
    if (item.project && targetProject?.name !== item.project) {
      errors.push({
        id: item.id,
        title: conversation.title,
        reason: "target-project-renamed",
        expectedProject: item.project,
        currentProject: targetProject?.name || null
      });
      continue;
    }

    eligible.push({
      id: item.id,
      title: conversation.title,
      titleHash: item.titleHash,
      previousGizmoId: expectedGizmoId,
      targetGizmoId: item.targetGizmoId,
      project: item.project || targetProject?.name || null,
      projectId: item.targetGizmoId
    });
  }

  return { eligible, errors };
}

export function mergeMoveResults(moves, results) {
  const resultById = new Map((results || []).map((item) => [item.id, item]));
  return (moves || []).map((move) => {
    const result = resultById.get(move.id);
    return {
      id: move.id,
      title: move.title,
      previousGizmoId: move.previousGizmoId,
      project: move.project,
      projectId: move.projectId,
      targetGizmoId: move.targetGizmoId,
      titleHash: move.titleHash,
      status: result?.status || "failed",
      httpStatus: result?.httpStatus ?? null,
      error: result ? (result.error ?? null) : "No result returned from page context."
    };
  });
}

export async function runSequentialMoves({
  moves = [],
  executeOne,
  onProgress = async () => {},
  delayMs = 0,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
} = {}) {
  if (typeof executeOne !== "function") throw new Error("runSequentialMoves requires executeOne.");
  const results = [];

  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    let result;
    try {
      result = await executeOne(move, index);
    } catch (error) {
      return { results, error: error.message, uncertainMove: move };
    }
    results.push(result);
    await onProgress([...results]);
    if (result.status !== "moved") {
      return {
        results,
        error: result.error || `Write failed with HTTP ${result.httpStatus ?? "unknown"}.`,
        uncertainMove: null
      };
    }
    if (delayMs && index < moves.length - 1) await sleep(delayMs);
  }

  return { results, error: null, uncertainMove: null };
}

export function createRollbackManifest(moves = []) {
  const items = moves
    .filter((item) => item.status === "moved")
    .map((item) => ({
      id: item.id,
      previousGizmoId: item.targetGizmoId,
      targetGizmoId: item.previousGizmoId,
      project: null,
      titleHash: item.titleHash
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    schemaVersion: 1,
    kind: "gpt-sorter-rollback",
    plannedCount: items.length,
    items
  };
}

export function attachRollbackManifest(report) {
  const rollbackManifest = createRollbackManifest(report.moves || []);
  return {
    ...report,
    rollbackManifest,
    rollbackFingerprint: fingerprintManifest(rollbackManifest)
  };
}

export function validateExecuteReport(report) {
  const errors = [];
  if (!report || typeof report !== "object") return { ok: false, errors: ["Execute report must be a JSON object."] };
  if (report.mode !== "execute") errors.push("Rollback plan must be an execute report.");
  const manifest = report.rollbackManifest;
  if (!manifest || manifest.kind !== "gpt-sorter-rollback" || manifest.schemaVersion !== 1) {
    errors.push("Execute report has no supported rollback manifest.");
  } else {
    validateManifestItems(manifest.items, errors, { requirePrevious: true, allowNullTarget: true });
    if (manifest.plannedCount !== manifest.items?.length) errors.push("Rollback manifest plannedCount does not match its items.");
    const moved = Array.isArray(report.moves) ? report.moves.filter((item) => item.status === "moved") : [];
    if (moved.length !== manifest.items?.length) {
      errors.push("Execute report moved items do not match its rollback manifest.");
    } else {
      const movedById = new Map(moved.map((item) => [item.id, item]));
      for (const item of manifest.items) {
        const source = movedById.get(item.id);
        if (!source || source.targetGizmoId !== item.previousGizmoId ||
            (source.previousGizmoId ?? null) !== (item.targetGizmoId ?? null) || source.titleHash !== item.titleHash) {
          errors.push(`Execute report item ${item.id} does not match its rollback manifest.`);
        }
      }
    }
    const expected = fingerprintManifest(manifest);
    if (report.rollbackFingerprint !== expected) errors.push("Rollback fingerprint does not match the saved manifest.");
  }
  return { ok: errors.length === 0, errors, manifest, rollbackFingerprint: report.rollbackFingerprint };
}
