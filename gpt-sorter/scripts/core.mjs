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
        try {
          matchers.push(new RegExp(pattern, "i"));
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
      if (typeof project !== "string" || !project.trim()) {
        configErrors.push(`exact[${JSON.stringify(title)}] must map to a non-empty project string.`);
        return;
      }
      config.exact[title] = project.trim();
    });
  }

  return {
    ok: configErrors.length === 0,
    config: configErrors.length === 0 ? config : null,
    configErrors
  };
}

export function projectMap(projects) {
  return new Map((projects || []).filter((project) => project?.id && project?.name).map((project) => [project.name, project.id]));
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
  const projectsByName = projectMap(projects);

  if (conversation.previousGizmoId && !includeInProject) {
    return skipped(conversation, "already-in-project");
  }

  const hasExact = Object.prototype.hasOwnProperty.call(config.exact, conversation.title);
  if (hasExact) {
    const project = config.exact[conversation.title];
    const projectId = projectsByName.get(project);
    if (!projectId) return skipped(conversation, "project-missing", { project, source: "exact" });
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

  if (matchedRules.length > 1) {
    return skipped(conversation, "ambiguous-multiple-rules", {
      candidateProjects: [...new Set(matchedRules.map((match) => match.project))],
      matchedRules: matchedRules.map(({ ruleIndex, project, matchedPatterns }) => ({ ruleIndex, project, matchedPatterns }))
    });
  }

  const project = matchedRules[0].project;
  const projectId = projectsByName.get(project);
  if (!projectId) {
    return skipped(conversation, "project-missing", { project });
  }
  if (conversation.previousGizmoId === projectId) {
    return skipped(conversation, "already-target-project", { project, projectId });
  }

  return planned(conversation, project, projectId, {
    source: "rule",
    matchedRule: {
      ruleIndex: matchedRules[0].ruleIndex,
      matchedPatterns: matchedRules[0].matchedPatterns
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
    return [`Failed: ${report.error || "unknown error"}`].join("\n");
  }

  const lines = [
    `Mode: ${report.mode}`,
    `Scanned: ${report.scanned ?? 0}`,
    `Projects: ${report.projectCount ?? 0}${report.projectPagination?.truncated ? " (possibly truncated)" : ""}`,
    `Planned: ${report.plannedCount ?? 0}`,
    `Skipped: ${report.skippedCount ?? 0}`
  ];

  if (report.movedCount !== undefined) lines.push(`Moved: ${report.movedCount}`);
  if (report.failedCount !== undefined) lines.push(`Failed moves: ${report.failedCount}`);

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

export function suggestRules({ projects = [], conversations = [], maxTitles = 100 } = {}) {
  const recentTitles = conversations.slice(0, maxTitles).map((conversation) => normalizeTitle(conversation.title)).filter(Boolean);
  const rules = projects.map((project) => {
    const match = keywordCandidates(project.name);
    const sampleTitles = recentTitles.filter((title) => title.toLocaleLowerCase().includes(project.name.toLocaleLowerCase())).slice(0, 5);
    return {
      project: project.name,
      match,
      sampleTitles
    };
  });

  return {
    rules,
    exact: {},
    _meta: {
      generatedBy: "gpt-sorter suggest-rules",
      projectCount: projects.length,
      scannedTitleCount: recentTitles.length,
      note: "Review and edit this draft before using it with preview or execute."
    }
  };
}
