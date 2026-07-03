# Repository Rules

## Structure

- `gpt-sorter/` is the installable Codex Skill directory.
- `gpt-sorter/scripts/` contains executable Node.js files and reusable script modules.
- `gpt-sorter/examples/` contains files that must remain available when only `gpt-sorter/` is installed as a Skill.
- `gpt-sorter/references/` contains Skill reference material for agents.
- `test/` contains Node.js tests that do not require a logged-in ChatGPT session.

## Implementation

- Keep the CLI compatible with `preview` and `execute` modes unless a safety rule requires an explicit new flag.
- Keep pure classification and config logic outside browser-evaluated code so it can be tested locally.
- Never print cookies, local storage, access tokens, or raw private API credentials.
- Treat ChatGPT private APIs as unstable: fail closed, write clear errors, and require a fresh preview after failures.

## Verification

- Run `node gpt-sorter/scripts/gpt_sorter.mjs --help`.
- Run `npm run smoke`.
- Run `npm test`.
