#!/usr/bin/env node
import fs from "node:fs";

const args = process.argv.slice(2);
const mode = args[0];

function usage() {
  console.error(`usage:
  gpt_sorter.mjs preview|execute [options]

options:
  --cdp <url>          Chrome DevTools endpoint, default http://127.0.0.1:9777
  --page-id <id>      Use a specific ChatGPT page target
  --open              Open https://chatgpt.com through CDP when no page target exists
  --scan <all|N>      Scan all visible history or first N conversations, default 100
  --rules <file>      JSON rules file with {rules:[{project,match:[]}], exact:{title:project}}
  --delay-ms <N>      Delay between write requests, default 250
`);
  process.exit(2);
}

if (!["preview", "execute"].includes(mode)) usage();

function option(name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
}

function hasFlag(name) {
  return args.includes(name);
}

const cdp = option("--cdp", "http://127.0.0.1:9777").replace(/\/$/, "");
const pageId = option("--page-id");
const scanArg = option("--scan", "100");
const rulesPath = option("--rules");
const delayMs = Number(option("--delay-ms", "250"));
if (!Number.isFinite(delayMs) || delayMs < 0) usage();

const scanLimit = scanArg === "all" ? null : Number(scanArg);
if (scanArg !== "all" && (!Number.isFinite(scanLimit) || scanLimit < 1)) usage();

const defaultConfig = {
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

const userConfig = rulesPath ? JSON.parse(fs.readFileSync(rulesPath, "utf8")) : {};
const config = {
  rules: userConfig.rules || defaultConfig.rules,
  exact: userConfig.exact || defaultConfig.exact
};

function redact(value) {
  return String(value).replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]");
}

async function getTargets() {
  const res = await fetch(`${cdp}/json/list`);
  if (!res.ok) throw new Error(`CDP target list failed: ${res.status}`);
  return await res.json();
}

async function openChatGPTPage() {
  const res = await fetch(`${cdp}/json/new?https://chatgpt.com`, { method: "PUT" });
  if (!res.ok) throw new Error(`CDP open page failed: ${res.status}`);
  return await res.json();
}

async function resolveTarget() {
  if (pageId) return { id: pageId, webSocketDebuggerUrl: `ws://127.0.0.1:${new URL(cdp).port}/devtools/page/${pageId}` };
  let targets = await getTargets();
  let target = targets.find((item) => item.type === "page" && /^https:\/\/chatgpt\.com\b/.test(item.url || ""));
  if (!target && hasFlag("--open")) {
    target = await openChatGPTPage();
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!target) throw new Error("No ChatGPT page target found. Open chatgpt.com in a CDP-enabled Chrome or pass --open.");
  return target;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let seq = 0;
  const pending = new Map();

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.id || !pending.has(msg.id)) return;
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  });

  const opened = new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

  return { ws, opened, send };
}

const target = await resolveTarget();
const { ws, opened, send } = connect(target.webSocketDebuggerUrl);
await opened;
await send("Runtime.enable");

const expression = `
(async () => {
  const mode = ${JSON.stringify(mode)};
  const scanLimit = ${scanLimit == null ? "null" : scanLimit};
  const delayMs = ${delayMs};
  const config = ${JSON.stringify(config)};

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

  const projectResp = await getJson("/backend-api/gizmos/snorlax/sidebar?owned_only=true&conversations_per_gizmo=0&limit=50");
  const projects = (projectResp.items || []).map((item) => {
    const gizmo = item?.gizmo?.gizmo || item?.gizmo || item;
    const display = gizmo?.display || item?.display || {};
    return { id: gizmo?.id || item?.id, name: display?.name || gizmo?.name || item?.name || "" };
  }).filter((project) => project.id && project.name);
  const projectByName = new Map(projects.map((project) => [project.name, project.id]));

  const conversations = [];
  const pageSize = 100;
  let offset = 0;
  for (let pageIndex = 0; pageIndex < 1000; pageIndex += 1) {
    const limit = scanLimit == null ? pageSize : Math.min(pageSize, scanLimit - offset);
    if (limit <= 0) break;
    const convResp = await getJson("/backend-api/conversations?offset=" + offset + "&limit=" + limit + "&order=updated&is_archived=false&is_starred=false");
    const items = convResp.items || [];
    conversations.push(...items.map((conversation) => ({
      id: conversation.id,
      title: conversation.title || "",
      gizmo_id: conversation.gizmo_id || conversation.gizmo?.id || null
    })));
    if (items.length < limit) break;
    offset += limit;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const exactProjectByTitle = new Map(Object.entries(config.exact || {}));
  const rules = (config.rules || []).map((rule) => ({
    project: rule.project,
    matchers: (rule.match || []).map((pattern) => new RegExp(pattern, "i"))
  }));

  const planned = [];
  const skipped = [];
  for (const conversation of conversations) {
    if (conversation.gizmo_id) {
      skipped.push({ title: conversation.title, reason: "already-in-project" });
      continue;
    }
    const exactProject = exactProjectByTitle.get(conversation.title);
    const rule = exactProject ? { project: exactProject } : rules.find((candidate) => candidate.matchers.some((matcher) => matcher.test(conversation.title)));
    if (!rule) {
      skipped.push({ title: conversation.title, reason: "no-confident-project" });
      continue;
    }
    const projectId = projectByName.get(rule.project);
    if (!projectId) {
      skipped.push({ title: conversation.title, reason: "project-missing", project: rule.project });
      continue;
    }
    planned.push({ id: conversation.id, title: conversation.title, project: rule.project, projectId });
  }

  const moved = [];
  const failed = [];
  if (mode === "execute") {
    for (const item of planned) {
      const res = await fetch("/backend-api/conversation/" + encodeURIComponent(item.id), {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({ gizmo_id: item.projectId })
      });
      const text = await res.text();
      if (res.ok) moved.push({ title: item.title, project: item.project });
      else failed.push({ title: item.title, project: item.project, status: res.status, text: text.slice(0, 160) });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const byProject = planned.reduce((acc, item) => {
    acc[item.project] = (acc[item.project] || 0) + 1;
    return acc;
  }, {});

  return {
    ok: true,
    mode,
    scanned: conversations.length,
    projectCount: projects.length,
    plannedCount: planned.length,
    movedCount: moved.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    byProject,
    planned: planned.map(({ title, project }) => ({ title, project })),
    moved,
    failed,
    skipped
  };
})().catch((error) => ({ ok: false, error: String(error), stack: error?.stack?.slice(0, 500) }))
`;

const result = await send("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true
});

console.log(redact(JSON.stringify(result.result?.value ?? result, null, 2)));
ws.close();
