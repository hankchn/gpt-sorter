<p align="center"><a href="./README.md">简体中文</a> | <b>English</b></p>

# GPT Sorter

A reusable Codex Skill for sorting ChatGPT web conversations into existing ChatGPT Projects.

It distills a real organization workflow: observe the ChatGPT web app's private project APIs through an already logged-in browser session, preview a rule-based move plan, wait for user confirmation, then move only conversations that confidently match existing projects. Conversations with no matching project, unclear titles, or an existing project assignment are skipped by default.

## What It Does

- Uses the currently logged-in ChatGPT web session without requiring a data export.
- Lists existing ChatGPT Projects and recent or all visible conversations.
- Builds a move plan from title rules and exact title mappings.
- Previews first, executes only after confirmation, then previews again.
- Moves only into existing projects and never creates project folders by default.
- Does not read conversation bodies, browser cookies, local storage, or persist access tokens by default.

## Quick Start

1. Open Chrome with a debugging port and log in to ChatGPT:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9777 --user-data-dir=/tmp/gpt-sorter
```

2. Open `https://chatgpt.com` in that Chrome profile and confirm you are logged in.

3. From the repository root, preview the classification:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan all
```

4. To customize rules, copy and edit `examples/rules.example.json`:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan all --rules examples/rules.example.json
```

5. Execute only after the user confirms the preview:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs execute --scan all --rules examples/rules.example.json
```

## Use As A Skill

Place `gpt-sorter/` in your Codex skills directory, then trigger it with:

```text
Use $gpt-sorter to preview and batch move my ChatGPT conversations into existing projects.
```

The Skill flow:

1. Confirm the scope: recent N conversations or all visible history.
2. Generate classification rules from existing projects and titles.
3. Show a preview with planned moves and skipped items.
4. Wait for explicit confirmation such as `确认` or `execute`.
5. Move the conversations and preview again to verify the remaining items.

## Rule Example

```json
{
  "rules": [
    { "project": "Work", "match": ["meeting", "roadmap", "requirement", "retro"] },
    { "project": "Learning", "match": ["course", "notes", "tutorial", "concept"] },
    { "project": "Writing", "match": ["draft", "outline", "headline", "rewrite"] }
  ],
  "exact": {
    "Quarterly planning discussion": "Work"
  }
}
```

`match` entries are case-insensitive regular-expression fragments. `exact` title mappings have the highest priority.

## Default Skips

- Conversations already assigned to a project.
- Matches whose target project does not exist.
- Titles that do not match any rule.
- Semantic-empty titles such as `New chat`.
- Ambiguous classifications that the user has not confirmed.

## Private API Notes

This Skill uses internal ChatGPT web endpoints for project listing, conversation listing, and project assignment. These APIs are unstable and may change. See `gpt-sorter/references/private_api.md`.

## Safety And Privacy

- Does not read or save browser cookies.
- Does not return access tokens to the Node process or logs.
- Classifies from titles by default and does not read conversation bodies.
- Requires preview and explicit user confirmation before moving conversations.
- Moves only into existing projects and does not create or delete projects.

## Requirements

- Node.js 22 or newer.
- A logged-in ChatGPT browser page.
- A Chrome DevTools Protocol endpoint, default `http://127.0.0.1:9777`.

## License

MIT

## Contributors

Created by hankchn with OpenAI Codex.
