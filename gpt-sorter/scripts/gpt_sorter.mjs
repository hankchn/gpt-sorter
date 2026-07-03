#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import {
  DEFAULT_CONFIG,
  buildPlan,
  formatHumanReport,
  suggestRules,
  validateConfig
} from "./core.mjs";

const DEFAULT_CDP = "http://127.0.0.1:9777";
const DEFAULT_SCAN = "100";
const DEFAULT_DELAY_MS = 250;
const DEFAULT_TIMEOUT_MS = 30_000;
const MODES = new Set(["preview", "execute", "suggest-rules", "rollback"]);

function usage(exitCode = 0) {
  const text = `usage:
  gpt-sorter --help
  gpt-sorter preview [options]
  gpt-sorter execute [options] --confirm-count <N>|--confirm-plan
  gpt-sorter suggest-rules [options] --out <file>
  gpt-sorter rollback --plan <execute-report.json> --confirm-count <N>|--confirm-plan

options:
  --cdp <url>               Chrome DevTools endpoint, default ${DEFAULT_CDP}
  --page-id <id>            Use a specific ChatGPT page target from /json/list
  --open                    Open https://chatgpt.com through CDP when no page target exists
  --scan <all|N>            Scan all visible history or first N conversations, default ${DEFAULT_SCAN}
  --rules <file>            JSON rules file with {rules:[{project,match:[]}], exact:{title:project}}
  --delay-ms <N>            Delay between write requests, default ${DEFAULT_DELAY_MS}
  --timeout-ms <N>          CDP WebSocket RPC timeout, default ${DEFAULT_TIMEOUT_MS}
  --confirm-count <N>       Execute only if plannedCount exactly equals N
  --confirm-plan            Execute or rollback the currently generated plan
  --out <file>              Write JSON report or suggested rules
  --json                    Print full JSON instead of a human summary
  --max-preview-items <N>   Human summary sample size, default 20
  --include-archived        Include archived conversations in scanning
  --include-starred         Include starred conversations in scanning
  --include-in-project      Allow conversations already in a project to be replanned
  --plan <file>             Execute report to use for rollback
`;
  const stream = exitCode === 0 ? process.stdout : process.stderr;
  stream.write(text);
  process.exit(exitCode);
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  const mode = argv[0];
  if (!MODES.has(mode)) usage(2);

  const options = {
    mode,
    cdp: DEFAULT_CDP,
    scanArg: DEFAULT_SCAN,
    delayMs: DEFAULT_DELAY_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxPreviewItems: 20,
    includeArchived: false,
    includeStarred: false,
    includeInProject: false,
    confirmPlan: false,
    confirmCount: null,
    open: false,
    pageId: null,
    rulesPath: null,
    outFile: null,
    planFile: null,
    json: false
  };

  const valueOptions = new Set([
    "--cdp",
    "--page-id",
    "--scan",
    "--rules",
    "--delay-ms",
    "--timeout-ms",
    "--confirm-count",
    "--out",
    "--max-preview-items",
    "--plan"
  ]);
  const flagOptions = new Set([
    "--open",
    "--json",
    "--confirm-plan",
    "--include-archived",
    "--include-starred",
    "--include-in-project"
  ]);

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (valueOptions.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) usage(2);
      index += 1;
      if (arg === "--cdp") options.cdp = value.replace(/\/$/, "");
      if (arg === "--page-id") options.pageId = value;
      if (arg === "--scan") options.scanArg = value;
      if (arg === "--rules") options.rulesPath = value;
      if (arg === "--delay-ms") options.delayMs = toNonNegativeNumber(value, "--delay-ms");
      if (arg === "--timeout-ms") options.timeoutMs = toPositiveNumber(value, "--timeout-ms");
      if (arg === "--confirm-count") options.confirmCount = toNonNegativeInteger(value, "--confirm-count");
      if (arg === "--out") options.outFile = value;
      if (arg === "--max-preview-items") options.maxPreviewItems = toNonNegativeInteger(value, "--max-preview-items");
      if (arg === "--plan") options.planFile = value;
      continue;
    }

    if (flagOptions.has(arg)) {
      if (arg === "--open") options.open = true;
      if (arg === "--json") options.json = true;
      if (arg === "--confirm-plan") options.confirmPlan = true;
      if (arg === "--include-archived") options.includeArchived = true;
      if (arg === "--include-starred") options.includeStarred = true;
      if (arg === "--include-in-project") options.includeInProject = true;
      continue;
    }

    usage(2);
  }

  options.scanLimit = parseScanLimit(options.scanArg);
  return options;
}

function toPositiveNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function toNonNegativeNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return parsed;
}

function toNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
}

function parseScanLimit(scanArg) {
  if (scanArg === "all") return null;
  const parsed = Number(scanArg);
  if (!Number.isInteger(parsed) || parsed < 1) usage(2);
  return parsed;
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return { __readError: `Failed to read ${label} ${filePath}: ${error.message}` };
  }
}

function loadConfig(rulesPath) {
  if (!rulesPath) return validateConfig(DEFAULT_CONFIG);
  const rawConfig = readJsonFile(rulesPath, "rules file");
  if (rawConfig.__readError) {
    return { ok: false, config: null, configErrors: [rawConfig.__readError] };
  }
  return validateConfig(rawConfig);
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function outputReport(report, options) {
  const finalReport = { ...report };
  if (options.outFile) {
    finalReport.outputFile = path.resolve(options.outFile);
    writeJson(options.outFile, finalReport);
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(finalReport, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatHumanReport(finalReport, { maxPreviewItems: options.maxPreviewItems })}\n`);
  }
}

async function fetchJson(url, { method = "GET", timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method, signal: controller.signal });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getTargets(cdp, timeoutMs) {
  return await fetchJson(`${cdp}/json/list`, { timeoutMs });
}

async function openChatGPTPage(cdp, timeoutMs) {
  return await fetchJson(`${cdp}/json/new?${encodeURIComponent("https://chatgpt.com")}`, {
    method: "PUT",
    timeoutMs
  });
}

function webSocketUrlFromCdp(cdp, pageId) {
  const url = new URL(cdp);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/devtools/page/${pageId}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

async function resolveTarget(options) {
  let targets = await getTargets(options.cdp, options.timeoutMs);

  if (options.pageId) {
    const target = targets.find((item) => item.id === options.pageId);
    if (target?.webSocketDebuggerUrl) return target;
    return {
      id: options.pageId,
      url: null,
      webSocketDebuggerUrl: webSocketUrlFromCdp(options.cdp, options.pageId)
    };
  }

  let target = targets.find((item) => item.type === "page" && /^https:\/\/chatgpt\.com\b/.test(item.url || ""));
  if (!target && options.open) {
    target = await openChatGPTPage(options.cdp, options.timeoutMs);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    targets = await getTargets(options.cdp, options.timeoutMs);
    target = targets.find((item) => item.id === target.id) || target;
  }

  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No ChatGPT page target found. Open chatgpt.com in a CDP-enabled Chrome or pass --open.");
  }
  return target;
}

function eventError(prefix, event) {
  const message = event?.message || event?.reason || event?.type || "unknown";
  return new Error(`${prefix}: ${message}`);
}

function connect(wsUrl, timeoutMs) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();

  function rejectAll(error) {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  }

  ws.addEventListener("message", (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (error) {
      rejectAll(new Error(`CDP returned invalid JSON: ${error.message}`));
      return;
    }
    if (!msg.id || !pending.has(msg.id)) return;
    const item = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(item.timer);
    msg.error ? item.reject(new Error(JSON.stringify(msg.error))) : item.resolve(msg.result);
  });

  ws.addEventListener("close", (event) => {
    rejectAll(eventError("WebSocket closed", event));
  });
  ws.addEventListener("error", (event) => {
    rejectAll(eventError("WebSocket error", event));
  });

  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`WebSocket open timed out after ${timeoutMs}ms`)), timeoutMs);
    ws.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      "error",
      (event) => {
        clearTimeout(timer);
        reject(eventError("WebSocket error before open", event));
      },
      { once: true }
    );
    ws.addEventListener(
      "close",
      (event) => {
        clearTimeout(timer);
        reject(eventError("WebSocket closed before open", event));
      },
      { once: true }
    );
  });

  const send = (method, params = {}, sendOptions = {}) =>
    new Promise((resolve, reject) => {
      if (ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`WebSocket is not open for ${method}.`));
        return;
      }
      const id = ++seq;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP method ${method} timed out after ${sendOptions.timeoutMs || timeoutMs}ms.`));
      }, sendOptions.timeoutMs || timeoutMs);
      pending.set(id, { resolve, reject, timer, method });
      ws.send(JSON.stringify({ id, method, params }));
    });

  const close = () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
  };

  return { opened, send, close };
}

async function evaluate(send, expression, timeoutMs) {
  const result = await send(
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true
    },
    { timeoutMs }
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed.");
  }
  return result.result?.value ?? result;
}

async function withChatGPTPage(options, fn) {
  const target = await resolveTarget(options);
  const connection = connect(target.webSocketDebuggerUrl, options.timeoutMs);
  try {
    await connection.opened;
    await connection.send("Runtime.enable");
    return await fn(connection.send);
  } finally {
    connection.close();
  }
}

function snapshotExpression(options) {
  return `
(async () => {
  const scanLimit = ${options.scanLimit == null ? "null" : Number(options.scanLimit)};
  const includeArchived = ${JSON.stringify(options.includeArchived)};
  const includeStarred = ${JSON.stringify(options.includeStarred)};

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
  const session = sessionRes.ok ? await sessionRes.json() : {};
  const token = session?.accessToken || session?.access_token || null;
  if (!token) return { ok: false, error: "missing access token", sessionStatus: sessionRes.status };

  const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
  const getJson = async (url) => {
    const res = await fetch(url, { credentials: "include", headers });
    const text = await res.text();
    if (!res.ok) throw new Error(url + " -> " + res.status + " " + text.slice(0, 160));
    return JSON.parse(text);
  };

  const normalizeProject = (item) => {
    const gizmo = item?.gizmo?.gizmo || item?.gizmo || item;
    const display = gizmo?.display || item?.display || {};
    return { id: gizmo?.id || item?.id, name: display?.name || gizmo?.name || item?.name || "" };
  };

  const projects = [];
  const seenProjects = new Set();
  const projectWarnings = [];
  let projectOffset = 0;
  let projectCursor = null;
  let projectPaginationSupported = true;
  let projectCursorSupported = false;
  let projectTruncated = false;

  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const params = new URLSearchParams({
      owned_only: "true",
      conversations_per_gizmo: "0",
      limit: "50"
    });
    if (projectCursor) params.set("cursor", projectCursor);
    else if (projectOffset) params.set("offset", String(projectOffset));

    let projectResp;
    try {
      projectResp = await getJson("/backend-api/gizmos/snorlax/sidebar?" + params.toString());
    } catch (error) {
      if (pageIndex === 0) throw error;
      projectWarnings.push(String(error));
      projectTruncated = true;
      projectPaginationSupported = false;
      break;
    }

    const items = projectResp.items || [];
    let added = 0;
    for (const item of items) {
      const project = normalizeProject(item);
      if (project.id && project.name && !seenProjects.has(project.id)) {
        projects.push(project);
        seenProjects.add(project.id);
        added += 1;
      }
    }

    const nextCursor = projectResp.next_cursor || projectResp.nextCursor || projectResp.cursor?.next || null;
    if (nextCursor) {
      projectCursor = nextCursor;
      projectCursorSupported = true;
    } else if (projectCursorSupported) {
      break;
    } else {
      projectOffset += 50;
    }

    if (items.length < 50) break;
    if (pageIndex > 0 && added === 0) {
      projectPaginationSupported = false;
      projectTruncated = true;
      break;
    }
    await sleep(100);
  }

  const conversations = [];
  const pageSize = 100;
  let offset = 0;
  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const limit = scanLimit == null ? pageSize : Math.min(pageSize, scanLimit - offset);
    if (limit <= 0) break;
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
      order: "updated"
    });
    if (!includeArchived) params.set("is_archived", "false");
    if (!includeStarred) params.set("is_starred", "false");

    const convResp = await getJson("/backend-api/conversations?" + params.toString());
    const items = convResp.items || [];
    conversations.push(...items.map((conversation) => ({
      id: conversation.id,
      title: conversation.title || "",
      gizmo_id: conversation.gizmo_id || conversation.gizmo?.id || null,
      is_archived: Boolean(conversation.is_archived),
      is_starred: Boolean(conversation.is_starred)
    })));
    if (items.length < limit) break;
    offset += limit;
    await sleep(100);
  }

  return {
    ok: true,
    projects,
    conversations,
    projectPagination: {
      limit: 50,
      fetched: projects.length,
      cursorSupported: projectCursorSupported,
      paginationSupported: projectPaginationSupported,
      truncated: projectTruncated,
      warnings: projectWarnings
    },
    conversationFilters: {
      includeArchived,
      includeStarred
    }
  };
})().catch((error) => ({ ok: false, error: String(error) }))
`;
}

function applyMovesExpression(moves, delayMs) {
  return `
(async () => {
  const moves = ${JSON.stringify(moves)};
  const delayMs = ${Number(delayMs)};
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const sessionRes = await fetch("/api/auth/session", { credentials: "include" });
  const session = sessionRes.ok ? await sessionRes.json() : {};
  const token = session?.accessToken || session?.access_token || null;
  if (!token) return { ok: false, error: "missing access token", sessionStatus: sessionRes.status };

  const headers = { authorization: "Bearer " + token, "content-type": "application/json" };
  const results = [];
  for (const item of moves) {
    try {
      const res = await fetch("/backend-api/conversation/" + encodeURIComponent(item.id), {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({ gizmo_id: item.targetGizmoId })
      });
      const text = await res.text();
      results.push({
        id: item.id,
        title: item.title,
        previousGizmoId: item.previousGizmoId,
        targetGizmoId: item.targetGizmoId,
        project: item.project,
        projectId: item.projectId,
        status: res.ok ? "moved" : "failed",
        httpStatus: res.status,
        error: res.ok ? null : text.slice(0, 240)
      });
    } catch (error) {
      results.push({
        id: item.id,
        title: item.title,
        previousGizmoId: item.previousGizmoId,
        targetGizmoId: item.targetGizmoId,
        project: item.project,
        projectId: item.projectId,
        status: "failed",
        httpStatus: null,
        error: String(error)
      });
    }
    await sleep(delayMs);
  }
  return { ok: true, results };
})().catch((error) => ({ ok: false, error: String(error) }))
`;
}

function requireWriteConfirmation(options, action) {
  if (options.confirmPlan || options.confirmCount !== null) return null;
  return `${action} requires --confirm-count <N> or --confirm-plan. Run preview first, then confirm the exact planned count.`;
}

function confirmCountMismatch(options, count, label = "plannedCount") {
  if (options.confirmCount === null) return null;
  if (options.confirmCount !== count) {
    return `--confirm-count mismatch: ${label} is ${count}, but confirm-count is ${options.confirmCount}.`;
  }
  return null;
}

async function buildSnapshot(options) {
  const snapshot = await withChatGPTPage(options, async (send) =>
    await evaluate(send, snapshotExpression(options), options.timeoutMs)
  );
  if (!snapshot.ok) throw new Error(snapshot.error || "Failed to read ChatGPT data.");
  return snapshot;
}

async function runPreviewOrExecute(options) {
  if (options.mode === "execute") {
    const confirmationError = requireWriteConfirmation(options, "execute");
    if (confirmationError) {
      outputReport({ ok: false, mode: options.mode, error: confirmationError }, options);
      return 1;
    }
  }

  const configResult = loadConfig(options.rulesPath);
  if (!configResult.ok) {
    outputReport({ ok: false, mode: options.mode, configErrors: configResult.configErrors }, options);
    return 1;
  }

  const snapshot = await buildSnapshot(options);
  const plan = buildPlan({
    conversations: snapshot.conversations,
    projects: snapshot.projects,
    config: configResult.config,
    includeInProject: options.includeInProject,
    projectPagination: snapshot.projectPagination
  });

  const baseReport = {
    ok: true,
    mode: options.mode,
    generatedAt: new Date().toISOString(),
    scan: options.scanArg,
    filters: {
      includeArchived: options.includeArchived,
      includeStarred: options.includeStarred,
      includeInProject: options.includeInProject
    },
    ...plan
  };

  if (options.mode === "preview") {
    outputReport(baseReport, options);
    return 0;
  }

  const mismatch = confirmCountMismatch(options, plan.plannedCount);
  if (mismatch) {
    outputReport({ ...baseReport, ok: false, error: mismatch }, options);
    return 1;
  }

  const moves = plan.planned.map((item) => ({
    ...item,
    targetGizmoId: item.projectId
  }));
  const execution = await withChatGPTPage(options, async (send) =>
    await evaluate(send, applyMovesExpression(moves, options.delayMs), Math.max(options.timeoutMs, moves.length * (options.delayMs + 10_000)))
  );
  if (!execution.ok) throw new Error(execution.error || "Execution failed.");

  const moveResults = mergeMoveResults(moves, execution.results);
  const executeReport = {
    ...baseReport,
    movedCount: moveResults.filter((item) => item.status === "moved").length,
    failedCount: moveResults.filter((item) => item.status === "failed").length,
    moves: moveResults,
    rollback: {
      supported: true,
      command: "gpt-sorter rollback --plan <execute-report.json> --confirm-count <movedCount>"
    }
  };
  outputReport(executeReport, options);
  return executeReport.failedCount ? 1 : 0;
}

function mergeMoveResults(moves, results) {
  const resultById = new Map((results || []).map((item) => [item.id, item]));
  return moves.map((move) => {
    const result = resultById.get(move.id);
    return {
      id: move.id,
      title: move.title,
      previousGizmoId: move.previousGizmoId,
      project: move.project,
      projectId: move.projectId,
      targetGizmoId: move.targetGizmoId,
      status: result?.status || "failed",
      httpStatus: result?.httpStatus ?? null,
      error: result?.error ?? "No result returned from page context."
    };
  });
}

async function runSuggestRules(options) {
  if (!options.outFile) {
    outputReport({ ok: false, mode: options.mode, error: "suggest-rules requires --out <file>." }, options);
    return 1;
  }
  const snapshot = await buildSnapshot(options);
  const draft = suggestRules({
    projects: snapshot.projects,
    conversations: snapshot.conversations,
    maxTitles: options.scanLimit ?? snapshot.conversations.length
  });
  writeJson(options.outFile, draft);

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ok: true, mode: options.mode, outFile: path.resolve(options.outFile), ...draft._meta }, null, 2)}\n`);
  } else {
    process.stdout.write(`Suggested rules written: ${path.resolve(options.outFile)}\n`);
    process.stdout.write("Review and edit the draft, then run preview with --rules before any execute.\n");
  }
  return 0;
}

async function runRollback(options) {
  if (!options.planFile) {
    outputReport({ ok: false, mode: options.mode, error: "rollback requires --plan <execute-report.json>." }, options);
    return 1;
  }

  const confirmationError = requireWriteConfirmation(options, "rollback");
  if (confirmationError) {
    outputReport({ ok: false, mode: options.mode, error: confirmationError }, options);
    return 1;
  }

  const plan = readJsonFile(options.planFile, "execute report");
  if (plan.__readError) {
    outputReport({ ok: false, mode: options.mode, error: plan.__readError }, options);
    return 1;
  }

  const movedItems = (plan.moves || [])
    .filter((item) => item.status === "moved" && item.id && Object.prototype.hasOwnProperty.call(item, "previousGizmoId"))
    .map((item) => ({
      id: item.id,
      title: item.title,
      previousGizmoId: item.previousGizmoId,
      targetGizmoId: item.previousGizmoId,
      project: item.project,
      projectId: item.projectId
    }));

  const mismatch = confirmCountMismatch(options, movedItems.length, "rollback item count");
  if (mismatch) {
    outputReport({ ok: false, mode: options.mode, error: mismatch, rollbackCount: movedItems.length }, options);
    return 1;
  }

  const execution = await withChatGPTPage(options, async (send) =>
    await evaluate(send, applyMovesExpression(movedItems, options.delayMs), Math.max(options.timeoutMs, movedItems.length * (options.delayMs + 10_000)))
  );
  if (!execution.ok) throw new Error(execution.error || "Rollback failed.");

  const rollbackResults = mergeMoveResults(movedItems, execution.results).map((item) => ({
    ...item,
    status: item.status === "moved" ? "restored" : item.status
  }));
  outputReport(
    {
      ok: true,
      mode: options.mode,
      generatedAt: new Date().toISOString(),
      sourcePlan: path.resolve(options.planFile),
      rollbackCount: movedItems.length,
      restoredCount: rollbackResults.filter((item) => item.status === "restored").length,
      failedCount: rollbackResults.filter((item) => item.status === "failed").length,
      rollback: rollbackResults
    },
    options
  );
  return rollbackResults.some((item) => item.status === "failed") ? 1 : 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) usage(0);

  if (options.mode === "preview" || options.mode === "execute") return await runPreviewOrExecute(options);
  if (options.mode === "suggest-rules") return await runSuggestRules(options);
  if (options.mode === "rollback") return await runRollback(options);
  usage(2);
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
