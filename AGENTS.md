# Repository Rules

## Structure

- `gpt-sorter/` is the installable Codex Skill directory.
- `gpt-sorter/scripts/` contains executable Node.js files and reusable script modules.
- `gpt-sorter/examples/` contains files that must remain available when only `gpt-sorter/` is installed as a Skill.
- `gpt-sorter/references/` contains Skill reference material for agents.
- `test/` contains Node.js tests that do not require a logged-in ChatGPT session.
- `.github/workflows/` contains repository CI; keep it dependency-free and aligned with the supported Node.js versions.

## Implementation

- Keep the CLI compatible with `preview` and `execute` modes unless a safety rule requires an explicit new flag.
- Keep pure classification and config logic outside browser-evaluated code so it can be tested locally.
- Never print cookies, local storage, access tokens, or raw private API credentials.
- Treat ChatGPT private APIs as unstable: fail closed, write clear errors, and require a fresh preview after failures.
- Treat preview files as immutable write plans: fingerprint the exact conversation and target state, execute only from a saved preview, and re-check live state before every batch write.
- Persist the execute report before the first write and after every item; stop the batch after the first failed or uncertain write.
- Roll back only conversations that are still in the project recorded by the execute report; skip any conversation changed after execution.
- Do not persist conversation-title samples unless the user explicitly opts in.

## Verification

- Run `node gpt-sorter/scripts/gpt_sorter.mjs --help`.
- Run `npm run smoke`.
- Run `npm test`.
- Run `node --test --experimental-test-coverage` when write-path logic changes.
- Run the Skill Creator `quick_validate.py` against `gpt-sorter/` after changing `SKILL.md` or its metadata.
