# Rule Design Guide

## Classification Principles

- Move only into existing ChatGPT Projects.
- Preview before executing.
- Start with title-only rules. Ask before reading conversation contents.
- Use exact title overrides for ambiguous but user-confirmed cases.
- Keep broad regex rules conservative. Over-broad rules are worse than skipped items.
- Treat `New chat`, very short unclear titles, and multi-topic titles as skipped unless the user confirms.

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

Then wait for a clear confirmation such as `确认` or `执行`.
