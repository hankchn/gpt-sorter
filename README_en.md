<p align="center"><a href="./README.md">简体中文</a> | <b>English</b></p>

# GPT Sorter

A reusable Codex Skill for sorting ChatGPT web conversations into existing ChatGPT Projects.

The core principle is simple: move only conversations that are confidently classified. The script reads the current logged-in ChatGPT web session, lists existing Projects and conversation titles, builds a preview plan, and performs moves only after explicit confirmation.

## What It Does

- Uses the currently logged-in ChatGPT web session without requiring a data export.
- Lists existing ChatGPT Projects and recent or all visible conversations.
- Builds a move plan from title rules and exact title mappings.
- Prints a human-readable summary by default, with `--json` for full JSON output.
- Writes preview and execute reports with `--out <file>`.
- Moves only into existing projects and never creates project folders by default.
- Does not read conversation bodies, browser cookies, local storage, or persist access tokens by default.

## Quick Start

1. Open Chrome with a debugging port and log in to ChatGPT:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9777 --user-data-dir=/tmp/gpt-sorter
```

2. Open `https://chatgpt.com` in that Chrome profile and confirm you are logged in.

3. Start with 20 conversations so you can check the rule direction:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan 20
```

4. To customize rules, copy and edit the example inside the installable Skill directory:

```bash
cp gpt-sorter/examples/rules.example.json work/chatgpt-rules.json
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan 20 --rules work/chatgpt-rules.json
```

5. Expand the scope and save a preview report:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan all --rules work/chatgpt-rules.json --out work/gpt-sorter-preview.json
```

6. Execute only after checking `plannedCount`. `--confirm-count` must exactly match the generated plan:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs execute --scan all --rules work/chatgpt-rules.json --confirm-count 12 --out work/gpt-sorter-execute.json
```

## Use As A Skill

Place `gpt-sorter/` in your Codex skills directory, then trigger it with:

```text
Use $gpt-sorter to preview and batch move my ChatGPT conversations into existing projects.
```

When only the `gpt-sorter/` directory is installed, the example rules are still available inside the Skill:

```bash
node scripts/gpt_sorter.mjs preview --scan 20 --rules examples/rules.example.json
```

The Skill flow:

1. Confirm the scope. Start with `--scan 20`, then expand to `--scan all` after review.
2. Generate or adjust classification rules from existing projects and titles.
3. Show a preview summary and skipped reasons.
4. Wait for the user to check `plannedCount`, then execute with `--confirm-count <N>` or `--confirm-plan`.
5. Save an execute report and run preview again to verify remaining items.

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

`match` entries are case-insensitive regular-expression fragments. `exact` title mappings have the highest priority and can override semantic-empty title protection because they represent explicit user confirmation.

## Safe Classification Rules

- `exact` title mappings have the highest priority.
- Non-exact classification collects every matching rule.
- 0 matches: skipped as `no-confident-project`.
- 1 match: added to planned.
- Multiple matches: skipped as `ambiguous-multiple-rules` with candidate projects.
- `New chat`, empty titles, `Untitled`, and very short titles are skipped as `semantic-empty-title` by default.
- Broad regex patterns such as `.*` will not move `New chat`.

## Rule File Validation

preview and execute validate rule files locally before touching the browser:

- `rules` must be an array.
- Each rule must have a non-empty `project`.
- `match` must be an array of strings.
- `exact` must be a `{ "title": "project" }` object.
- Regex compilation failures are returned as `configErrors`; preview stops and execute refuses to run.

## CLI Options

```bash
node gpt-sorter/scripts/gpt_sorter.mjs --help
```

Common options:

- `--cdp <url>`: Chrome DevTools endpoint, default `http://127.0.0.1:9777`.
- `--page-id <id>`: use a specific page target from `/json/list`.
- `--scan all` or `--scan 100`: scan all visible history or the first N conversations.
- `--rules <file>`: rule file.
- `--out <file>`: write a JSON report.
- `--json`: print full JSON to the terminal.
- `--max-preview-items <N>`: control human-summary sample size.
- `--include-archived`, `--include-starred`, `--include-in-project`: expand the scan scope.

The default safe scope processes only ordinary history conversations that are not archived, not starred, and not already in a project.

## Helper Commands

Generate a draft rule file without moving anything:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs suggest-rules --scan 50 --out work/suggested-rules.json
```

If an execute report contains successful moves, roll them back to their previous `gizmo_id`:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs rollback --plan work/gpt-sorter-execute.json --confirm-count 12
```

## Private API Notes

This Skill uses internal ChatGPT web endpoints for project listing, conversation listing, and project assignment. These APIs are unstable and may change. If a private API fails, stop and run preview again; do not blindly retry destructive operations. See `gpt-sorter/references/private_api.md`.

## Safety And Privacy

- Does not read or save browser cookies.
- Does not return access tokens to the Node process or logs.
- Classifies from titles by default and does not read conversation bodies.
- execute requires `--confirm-count <N>` or `--confirm-plan`.
- execute reports include conversation id, title, previous project, target project, status, and error for audit and rollback.
- Moves only into existing projects and does not create or delete projects.

## Requirements

- Node.js 22 or newer.
- A logged-in ChatGPT browser page.
- A Chrome DevTools Protocol endpoint, default `http://127.0.0.1:9777`.

## License

MIT

## Contributors

Created by hankchn with OpenAI Codex.
