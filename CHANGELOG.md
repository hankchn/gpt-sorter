# Changelog

## 0.2.0 - 2026-07-16

- Bind execute operations to fingerprinted preview reports.
- Re-check titles, source projects, and target projects before writes.
- Persist an execute checkpoint after every item and stop after the first failed or uncertain write.
- Skip rollback items whose project state changed after execution.
- Reject duplicate project-name resolution and empty-matching regex rules.
- Generate conservative first-run rules from actual project names.
- Keep title samples out of generated rule files unless explicitly requested.
- Add critical-path tests and GitHub Actions CI for Node.js 22 and 24.

## 0.1.0 - 2026-07-03

- Initial public release with preview-first classification, explicit confirmation, audit reports, and rollback support.
