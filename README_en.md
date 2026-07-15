<p align="center"><a href="./README.md">简体中文</a> | <b>English</b></p>

# GPT Sorter

[![CI](https://github.com/hankchn/gpt-sorter/actions/workflows/ci.yml/badge.svg)](https://github.com/hankchn/gpt-sorter/actions/workflows/ci.yml)

A Codex Skill and Node.js CLI that safely organizes ChatGPT history into existing Projects.

Its goal is not to move as many conversations as possible. It moves only conversations that were reviewed in a saved preview and whose state is unchanged:

1. Read Project names and conversation titles from a logged-in ChatGPT page.
2. Generate a preview plan with a SHA-256 fingerprint.
3. Execute only that saved plan after re-checking each title, source Project, and target Project.
4. Roll back only conversations that are still in the Project recorded by the execute report.

## Output Structure Example

The numbers below only illustrate the preview format; they are not measured product results.

```text
Mode: preview
Scanned: 20
Projects: 6
Planned: 8
Skipped: 12

Planned by project:
- AI Product: 5
- Writing: 3

Plan fingerprint: 4f7b...a921
Report written: /path/to/work/preview.json
```

If a planned conversation is renamed or moved after preview, or its target Project is deleted or renamed, execute stops the whole batch and asks for a fresh preview.

## Good Fit

Use GPT Sorter when you already have ChatGPT Projects and want a preview-first, auditable way to organize existing conversations. It is not intended to create/delete Projects, bypass review, or provide a stable public ChatGPT API integration.

## Install

### Standalone CLI

```bash
git clone https://github.com/hankchn/gpt-sorter.git
cd gpt-sorter
node gpt-sorter/scripts/gpt_sorter.mjs --help
```

There are no runtime packages to install.

### Codex Skill

From the repository root:

```bash
mkdir -p ~/.codex/skills
ln -s "$PWD/gpt-sorter" ~/.codex/skills/gpt-sorter
```

Then ask Codex:

```text
Use $gpt-sorter to preview my ChatGPT conversations and safely move the confirmed plan into existing projects.
```

## 60-Second Start

### 1. Start a dedicated Chrome session

Use a disposable profile instead of your normal Chrome data directory:

```bash
PROFILE_DIR="$(mktemp -d /tmp/gpt-sorter.XXXXXX)"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9777 \
  --user-data-dir="$PROFILE_DIR"
```

Open `https://chatgpt.com` and log in. Chrome itself stores cookies and local state in `PROFILE_DIR`; the script does not read or print them. After closing that Chrome session, remove the disposable profile:

```bash
rm -rf "$PROFILE_DIR"
```

### 2. Generate a conservative rule draft

```bash
node gpt-sorter/scripts/gpt_sorter.mjs suggest-rules \
  --scan 50 \
  --out work/rules.json
```

The draft uses current Project names and reports planned, skipped, ambiguous, and unmatched coverage. It does not persist title samples unless `--include-title-samples` is explicitly supplied.

Preview can also run without `--rules`. In that case GPT Sorter creates conservative matches from the actual Project names instead of assuming fixed default Projects.

### 3. Save a preview

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview \
  --scan all \
  --rules work/rules.json \
  --out work/preview.json \
  --redact-titles
```

`--redact-titles` keeps titles visible in the terminal for review but removes them from the saved file. Title hashes remain so execute can detect renamed conversations.

### 4. Execute the exact saved plan

Copy the complete fingerprint printed by preview:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs execute \
  --plan work/preview.json \
  --confirm-plan <preview-fingerprint> \
  --out work/execute.json \
  --redact-titles
```

Execute requires both a saved preview and an output path for its audit/rollback report. `--confirm-count <N>` remains available for compatibility, but fingerprint confirmation is recommended.

Execute creates a checkpoint before the first write and updates it after every conversation. A failed or uncertain write stops the remaining batch, while already completed moves remain recoverable from the checkpoint.

### 5. Roll back safely when needed

The execute report contains a separate rollback fingerprint:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs rollback \
  --plan work/execute.json \
  --confirm-plan <rollback-fingerprint> \
  --out work/rollback.json
```

Rollback skips any conversation that was moved again after execute and returns a non-zero exit code for incomplete restoration.

## Rule File

```json
{
  "rules": [
    { "project": "Work", "match": ["meeting", "roadmap", "requirement", "retro"] },
    { "project": "Learning", "match": ["course", "notes", "tutorial", "concept"] }
  ],
  "exact": {
    "Quarterly planning discussion": "Work"
  }
}
```

- Exact title mappings have the highest priority.
- Match entries are case-insensitive regular-expression fragments.
- Matches across different Projects are skipped as `ambiguous-multiple-rules`.
- Duplicate Project names are skipped as `project-name-ambiguous` instead of resolving to an arbitrary ID.
- Blank patterns and patterns such as `.*` that match an empty title are rejected.
- `New chat`, `Untitled`, empty titles, and very short titles are skipped by default.

## Safety And Privacy

- The script does not read, return, or persist cookies, local storage, or access tokens.
- Chrome does persist login data in `--user-data-dir`; use a disposable directory and remove it after closing Chrome.
- The default flow reads conversation-list metadata and titles, not conversation bodies.
- Preview and execute reports normally include conversation IDs and titles; use `--redact-titles` to avoid persisting titles.
- `suggest-rules` does not persist title samples by default.
- Private API failures stop the flow instead of triggering blind write retries.

## Development

```bash
npm test
npm run test:coverage
npm run smoke
npm run check
```

GitHub Actions runs the checks on Node.js 22 and 24. Because the ChatGPT endpoints are private, release validation should still include a preview-only integration check with a logged-in test account.

## Requirements

- Node.js 22 or newer.
- Chrome or another Chromium browser with Chrome DevTools Protocol support.
- A logged-in `chatgpt.com` page reachable through the debug endpoint.

## Limitations

GPT Sorter uses internal ChatGPT web endpoints. They have no stability guarantee and may require future updates. See `gpt-sorter/references/private_api.md`.

## License

MIT

## Contributors

| Contributor | Contribution |
| --- | --- |
| Hank Yang | Product direction and maintenance |
| OpenAI Codex | Implementation, safety hardening, tests, and documentation assistance |
