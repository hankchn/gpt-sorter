# Rule Design Guide

## Classification Principles

- Move only into existing ChatGPT Projects.
- Preview before executing.
- Start with title-only rules. Ask before reading conversation contents.
- Use exact title overrides for ambiguous but user-confirmed cases.
- Keep broad regex rules conservative. Over-broad rules are worse than skipped items.
- Treat `New chat`, very short unclear titles, and multi-topic titles as skipped unless the user confirms.
- Exact title mappings have the highest priority and can override semantic-empty title protection.
- Non-exact matches must collect every matching rule. If more than one rule matches, skip as `ambiguous-multiple-rules` and show candidate projects.
- Multiple matching rules for the same Project are compatible and should be merged. Matches across different Projects are ambiguous.
- Do not use "first match wins"; it hides ambiguity and can move conversations into the wrong Project.
- Treat duplicate Project names as unresolved. Require unique names or a future explicit Project-ID rule instead of silently choosing one.
- Reject blank patterns and regular expressions such as `.*` that match an empty string.

## Recommended Rule Categories

Adapt to the user's actual project names. Example neutral project patterns:

```json
{
  "rules": [
    { "project": "工作", "match": ["会议", "路线图", "需求", "复盘", "项目"] },
    { "project": "学习", "match": ["课程", "笔记", "教程", "概念", "练习"] },
    { "project": "研究", "match": ["调研", "资料", "对比", "分析", "报告"] },
    { "project": "写作", "match": ["草稿", "大纲", "标题", "改写", "润色"] },
    { "project": "灵感", "match": ["想法", "创意", "设计", "方案", "头脑风暴"] },
    { "project": "事务", "match": ["清单", "安排", "提醒", "日程", "表格"] }
  ]
}
```

## User Confirmation Format

Show a compact preview:

```text
准备移动 12 条：
- 工作：3 条
- 学习：2 条
- 写作：4 条
- 事务：3 条

跳过：
- New chat：无标题语义
- Foo Bar：没有对应项目
```

Then show the complete `planFingerprint` and wait for a clear confirmation such as `确认` or `执行`.
For CLI execution, use the saved preview file with `--plan <preview.json>` and convert confirmation into `--confirm-plan <planFingerprint>`. Keep `--confirm-count <plannedCount>` only for compatibility.
