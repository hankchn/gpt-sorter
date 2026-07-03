---
name: gpt-sorter
description: Sort ChatGPT web conversations into existing ChatGPT Projects using the logged-in browser session and ChatGPT private project APIs. Use when the user wants to organize recent or all ChatGPT conversations into project folders, preview sorting rules, suggest draft rules, move conversations in bulk with explicit confirmation, roll back a saved execute report, or repeat the "sort my ChatGPT chats into projects" workflow. Requires an already logged-in chatgpt.com page reachable through a Chrome DevTools Protocol endpoint.
---

# GPT Sorter

## Workflow

Use this skill to sort ChatGPT conversations into existing ChatGPT Projects. The workflow is intentionally preview-first because the underlying ChatGPT endpoints are private and the operation changes the user's conversation organization.

1. Confirm scope. Prefer `--scan 20` for first use, then expand only after the preview looks right.
2. Confirm project rules. Use only existing ChatGPT Projects; do not create new projects unless the user explicitly asks.
3. Ensure a logged-in `https://chatgpt.com` page is reachable through Chrome DevTools Protocol.
4. Run `scripts/gpt_sorter.mjs preview` and show the user the summary, planned count, and skipped reasons.
5. Execute only with `--confirm-count <plannedCount>` or `--confirm-plan` after explicit user confirmation.
6. Save execute output with `--out <file>` for audit and possible rollback.
7. Run `preview` again; completion requires `plannedCount: 0` or a remaining list the user accepts as intentionally skipped.

## Safety Rules

- Do not read, print, or save browser cookies, local storage, or access tokens.
- Prefer page-context requests through an already logged-in browser page. The script fetches the session token inside the page and never returns it to Node.
- Do not include conversation contents by default; classify from titles unless the user explicitly approves deeper inspection.
- Default scope excludes archived conversations, starred conversations, and conversations already in a project.
- Do not move conversations that already have a `gizmo_id` unless the user explicitly asks to use `--include-in-project`.
- Treat private API details as unstable. If endpoints fail, stop and re-preview rather than retrying destructive changes blindly.
- Never force a category for `New chat`, `Untitled`, empty, or very short titles unless the user provides an `exact` mapping.

## Classification Rules

- `exact` title mappings have the highest priority and can override semantic-empty title protection.
- Non-exact classification collects all matching rules.
- 0 matching rules means skip as `no-confident-project`.
- 1 matching rule means add to planned.
- Multiple matching rules means skip as `ambiguous-multiple-rules` and show candidate projects.
- Broad regex rules must not move semantic-empty titles such as `New chat`.

## Script Usage

Use Node.js 22+ because the script relies on built-in `fetch` and `WebSocket`.

```bash
node scripts/gpt_sorter.mjs --help
node scripts/gpt_sorter.mjs preview --scan 20 --rules examples/rules.example.json
node scripts/gpt_sorter.mjs preview --scan all --rules work/chatgpt-rules.json --out work/gpt-sorter-preview.json
node scripts/gpt_sorter.mjs execute --scan all --rules work/chatgpt-rules.json --confirm-count 12 --out work/gpt-sorter-execute.json
```

Common options:

- `--cdp http://127.0.0.1:9777`: Chrome DevTools endpoint.
- `--scan all` or `--scan 100`: scan all visible pages or the first N conversations.
- `--rules <file>`: JSON file with `rules` and `exact` mappings.
- `--page-id <id>`: use a specific DevTools page target from `/json/list`.
- `--open`: open `https://chatgpt.com` through the CDP endpoint if no page exists.
- `--delay-ms 250`: delay between write requests during execution.
- `--confirm-count <N>`: execute only if `plannedCount` equals N.
- `--confirm-plan`: execute the currently generated plan after explicit user confirmation.
- `--out <file>`: write a JSON preview or execute report.
- `--json`: print the full report instead of the compact human summary.
- `--max-preview-items <N>`: limit human-summary samples.
- `--include-archived`, `--include-starred`, `--include-in-project`: expand the safe default scope.

## Rule File

Prefer a project-specific rule file generated from the user's existing projects and confirmed by the user. The installable Skill includes `examples/rules.example.json`.

```json
{
  "rules": [
    { "project": "工作", "match": ["会议", "路线图", "需求", "复盘"] },
    { "project": "学习", "match": ["课程", "笔记", "教程", "概念"] },
    { "project": "写作", "match": ["草稿", "大纲", "标题", "改写"] }
  ],
  "exact": {
    "季度规划讨论": "工作"
  }
}
```

`match` values are treated as case-insensitive regular-expression fragments. Rule files are validated before browser access:

- `rules` must be an array.
- Each rule must have a non-empty `project`.
- `match` must be an array of strings.
- `exact` must be an object mapping exact title to project.
- Invalid regex patterns return `configErrors`; preview stops and execute refuses to run.

## Suggested Rules

Use `suggest-rules` to create a draft rule file from current Projects and recent titles. It never moves conversations.

```bash
node scripts/gpt_sorter.mjs suggest-rules --scan 50 --out work/suggested-rules.json
```

Review and edit the draft, then run `preview` before any execute.

## Rollback

If an execute report was saved with `--out`, use it to restore moved conversations to their previous `gizmo_id`.

```bash
node scripts/gpt_sorter.mjs rollback --plan work/gpt-sorter-execute.json --confirm-count 12
```

## References

- Read `references/private_api.md` when troubleshooting endpoint behavior or updating the script.
- Read `references/rule_design.md` when designing or expanding classification rules.
