---
name: gpt-sorter
description: Sort ChatGPT web conversations into existing ChatGPT Projects using the logged-in browser session and ChatGPT private project APIs. Use when the user wants to organize recent or all ChatGPT conversations into project folders, preview sorting rules, move conversations in bulk, or repeat the "sort my ChatGPT chats into projects" workflow. Requires an already logged-in chatgpt.com page reachable through a Chrome DevTools Protocol endpoint.
---

# GPT Sorter

## Workflow

Use this skill to sort ChatGPT conversations into existing ChatGPT Projects. The workflow is intentionally preview-first because the underlying ChatGPT endpoints are private and the operation changes the user's conversation organization.

1. Confirm scope: recent N conversations or all visible history.
2. Confirm project rules: use only existing ChatGPT Projects; do not create new projects unless the user explicitly asks.
3. Ensure a logged-in `https://chatgpt.com` page is reachable through Chrome DevTools Protocol.
4. Run `scripts/gpt_sorter.mjs` in `preview` mode.
5. Show the user the proposed move list and uncertain skips.
6. Execute only after explicit confirmation.
7. Run `preview` again; completion requires `plannedCount: 0` or a remaining list the user accepts as intentionally skipped.

## Safety Rules

- Do not read, print, or save browser cookies, local storage, or access tokens.
- Prefer page-context requests through an already logged-in browser page. The script fetches the session token inside the page and never returns it to Node.
- Do not include conversation contents by default; classify from titles unless the user explicitly approves deeper inspection.
- Do not move conversations that already have a `gizmo_id`.
- Treat private API details as unstable. If endpoints fail, stop and re-preview rather than retrying destructive changes blindly.
- Never force a category for titles like `New chat` unless the user provides a rule.

## Script Usage

Use Node.js 22+ because the script relies on the built-in `WebSocket`.

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan all
node gpt-sorter/scripts/gpt_sorter.mjs execute --scan all --rules work/chatgpt-rules.json
```

Common options:

- `--cdp http://127.0.0.1:9777`: Chrome DevTools endpoint.
- `--scan all` or `--scan 100`: scan all visible pages or the first N conversations.
- `--rules <file>`: JSON file with `rules` and `exact` mappings.
- `--page-id <id>`: use a specific DevTools page target.
- `--open`: open `https://chatgpt.com` through the CDP endpoint if no page exists.
- `--delay-ms 250`: delay between write requests during execution.

## Rule File

Prefer a project-specific rule file generated from the user's existing projects and confirmed by the user:

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

`match` values are treated as case-insensitive regular-expression fragments. `exact` title mappings override pattern rules.

## References

- Read `references/private_api.md` when troubleshooting endpoint behavior or updating the script.
- Read `references/rule_design.md` when designing or expanding classification rules.
