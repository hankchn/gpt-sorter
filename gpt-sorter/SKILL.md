---
name: gpt-sorter
description: Safely sort ChatGPT web conversations into existing ChatGPT Projects through a logged-in Chrome session. Use when the user wants to inventory, preview, classify, batch move, audit, or roll back recent or all ChatGPT conversations; generate title-based Project rules; or repeat a preview-first conversation-organizing workflow. Requires a chatgpt.com page reachable through Chrome DevTools Protocol and uses unstable private web endpoints.
---

# GPT Sorter

## Workflow

Follow this sequence because execute changes the user's ChatGPT organization:

1. Confirm the scope and whether conversation titles may be persisted. Default to `--scan 20` and `--redact-titles` for the first preview.
2. Reach a logged-in `https://chatgpt.com` page through a Chrome DevTools Protocol endpoint. Recommend a disposable Chrome profile and tell the user that Chrome itself stores login data in that profile.
3. Generate or review rules based on the user's actual Project names. Do not assume fixed Projects such as Work or Learning.
4. Save preview output with `--out`; execute never regenerates a plan from current titles.
5. Show the planned count, per-Project totals, skipped reasons, and complete `planFingerprint`.
6. Wait for explicit user confirmation. Execute the saved preview with `--plan`, the confirmed fingerprint, and a separate `--out` execute report.
7. Run preview again. Finish only when the remaining plan is empty or the user accepts the skipped items.
8. If rollback is requested, use the execute report's `rollbackFingerprint`. Report conversations skipped because their Project state changed after execution.

## Safety Rules

- Never read, return, or persist browser cookies, local storage, or access tokens. Fetch the session token only inside page context and keep it there.
- Read conversation-list metadata and titles only. Do not read conversation bodies unless the user separately approves it.
- Do not persist title samples in generated rules unless the user explicitly approves `--include-title-samples`.
- Prefer `--redact-titles` for saved preview, execute, and rollback reports when titles are not needed on disk.
- Move only into existing Projects.
- Treat duplicate Project names as ambiguous; do not choose an arbitrary Project ID.
- Reject blank or empty-matching regular expressions.
- Skip semantic-empty titles such as `New chat`, `Untitled`, empty strings, and very short titles unless an exact mapping exists.
- Stop the whole execute batch if a title, source Project, or target Project changed after preview.
- Persist an execute checkpoint before the first write and after every item. Stop after the first failed or uncertain write.
- During rollback, restore only conversations that are still in the execute report's target Project. Never overwrite later user changes.
- Stop after private API failures and create a fresh preview. Do not blindly retry writes.

## Commands

Run from the repository root:

```bash
node gpt-sorter/scripts/gpt_sorter.mjs --help
node gpt-sorter/scripts/gpt_sorter.mjs suggest-rules --scan 50 --out work/rules.json
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan 20 --rules work/rules.json --out work/preview.json --redact-titles
node gpt-sorter/scripts/gpt_sorter.mjs execute --plan work/preview.json --confirm-plan <preview-fingerprint> --out work/execute.json --redact-titles
node gpt-sorter/scripts/gpt_sorter.mjs rollback --plan work/execute.json --confirm-plan <rollback-fingerprint> --out work/rollback.json
```

When only the Skill directory is installed, use `node scripts/gpt_sorter.mjs` and paths relative to the Skill directory.

`--confirm-count <N>` remains compatible with saved plans, but prefer the fingerprint because it confirms the exact plan rather than only its size.

## Rule Design

Use exact title mappings for user-confirmed exceptions. For regular rules, collect all matches and move only when every matching rule resolves to one unique Project. Multiple matching rules for the same Project are compatible; matches across different Projects are ambiguous and must be skipped.

When no `--rules` file is provided, preview creates conservative rules from actual Project names. Treat this as onboarding, not a finished semantic classifier. Review coverage and refine the rule file before broad execution.

## References

- Read `references/rule_design.md` when creating or expanding rules.
- Read `references/private_api.md` when endpoints fail or the ChatGPT web response shape changes.
