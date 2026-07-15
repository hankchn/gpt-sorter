<p align="center"><b>简体中文</b> | <a href="./README_en.md">English</a></p>

# GPT Sorter

[![CI](https://github.com/hankchn/gpt-sorter/actions/workflows/ci.yml/badge.svg)](https://github.com/hankchn/gpt-sorter/actions/workflows/ci.yml)

一个把 ChatGPT 历史对话批量整理到已有 Projects 的 Codex Skill 和 Node.js CLI。

它的核心不是“尽可能多移动”，而是“只移动预览过且状态没变的对话”：

1. 读取已登录 ChatGPT 页面中的 Project 和对话标题。
2. 生成 preview 计划和 SHA-256 指纹。
3. execute 只使用已保存的 preview，并在写入前再次校验标题、原 Project 和目标 Project。
4. rollback 只恢复仍处于上次执行目标 Project 的对话，不覆盖用户后续的手动调整。

## 输出结构示例

以下数字仅用于展示 preview 的输出结构，不代表实测数据：

```text
Mode: preview
Scanned: 20
Projects: 6
Planned: 8
Skipped: 12

Planned by project:
- AI 产品: 5
- 写作: 3

Plan fingerprint: 4f7b...a921
Report written: /path/to/work/preview.json
```

如果 preview 后某条对话被改名、移入其他 Project，或目标 Project 被删除/改名，execute 会停止整批操作并要求重新 preview。

## 适用范围

适合：

- 已经在 ChatGPT 中建好 Projects，想整理历史对话。
- 希望先预览、再批量执行，并保留审计与回滚文件。
- 愿意使用标题规则进行保守分类。

不适合：

- 需要自动创建、删除或重命名 Projects。
- 希望不经预览就全自动移动所有对话。
- 不能接受 ChatGPT 网页私有接口可能变化的工作流。

## 安装

### 作为独立 CLI

```bash
git clone https://github.com/hankchn/gpt-sorter.git
cd gpt-sorter
node gpt-sorter/scripts/gpt_sorter.mjs --help
```

项目没有运行时依赖，不需要 `npm install`。

### 安装为 Codex Skill

在仓库根目录执行：

```bash
mkdir -p ~/.codex/skills
ln -s "$PWD/gpt-sorter" ~/.codex/skills/gpt-sorter
```

然后可以向 Codex 说：

```text
Use $gpt-sorter to preview my ChatGPT conversations and safely move the confirmed plan into existing projects.
```

## 60 秒开始

### 1. 启动独立 Chrome 会话

建议使用一次性 profile，不要复用日常 Chrome 数据目录：

```bash
PROFILE_DIR="$(mktemp -d /tmp/gpt-sorter.XXXXXX)"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9777 \
  --user-data-dir="$PROFILE_DIR"
```

在这个 Chrome 中打开 `https://chatgpt.com` 并登录。Chrome 会把该会话的 cookie 和本地存储写入 `PROFILE_DIR`；脚本不会读取或输出它们。关闭该 Chrome 后可删除临时 profile：

```bash
rm -rf "$PROFILE_DIR"
```

### 2. 生成规则草案

```bash
node gpt-sorter/scripts/gpt_sorter.mjs suggest-rules \
  --scan 50 \
  --out work/rules.json
```

草案会使用当前 Project 名称生成保守关键词，并输出覆盖率、未匹配数和歧义数。默认不把对话标题样例写入文件；只有用户同意时才使用 `--include-title-samples`。

也可以直接运行不带 `--rules` 的 preview。此时只使用实际 Project 名称作为保守规则，不再假设用户拥有“工作/学习/写作”等固定 Projects。

### 3. 保存 preview

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview \
  --scan all \
  --rules work/rules.json \
  --out work/preview.json \
  --redact-titles
```

`--redact-titles` 会在终端中显示标题供用户审查，但不把标题写入报告文件。报告仍保留标题哈希，用于在 execute 前发现标题变化。

### 4. 执行确认过的计划

将 preview 输出的完整指纹填入 `--confirm-plan`：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs execute \
  --plan work/preview.json \
  --confirm-plan <preview-fingerprint> \
  --out work/execute.json \
  --redact-titles
```

`execute` 必须同时提供已保存的 preview 和 execute 报告输出路径。`--confirm-count <N>` 仍可用于兼容原工作流，但推荐使用指纹确认。

execute 会在第一次写入前创建检查点，每处理一条对话就更新报告。如果某条写入失败或结果不确定，后续对话不再继续执行，已成功部分仍可根据检查点回滚。

### 5. 需要时安全回滚

execute 报告会输出独立的 rollback 指纹：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs rollback \
  --plan work/execute.json \
  --confirm-plan <rollback-fingerprint> \
  --out work/rollback.json
```

如果某条对话在 execute 之后已被人工移到其他 Project，rollback 会跳过它并返回非零退出码。

## 规则文件

```json
{
  "rules": [
    { "project": "工作", "match": ["会议", "路线图", "需求", "复盘"] },
    { "project": "学习", "match": ["课程", "笔记", "教程", "概念"] }
  ],
  "exact": {
    "季度规划讨论": "工作"
  }
}
```

- `exact` 精确标题映射优先级最高。
- `match` 是大小写不敏感的正则片段。
- 同时匹配多个不同 Projects 时跳过为 `ambiguous-multiple-rules`。
- 同名 Projects 不会被静默选中，而是跳过为 `project-name-ambiguous`。
- 空字符串和 `.*` 这类可匹配空标题的正则会被拒绝。
- `New chat`、`Untitled`、空标题和过短标题默认跳过。

## 安全与隐私

- 脚本不读取、输出或保存 cookie、local storage 或 access token。
- Chrome 本身会将登录数据写入 `--user-data-dir`，因此建议使用一次性目录并在关闭 Chrome 后清理。
- 默认只读取对话列表元数据和标题，不读取对话正文。
- preview / execute 报告默认包含对话 ID 和标题；使用 `--redact-titles` 可不持久化标题。
- `suggest-rules` 默认不持久化标题样例。
- 私有接口失败时停止，不盲目重试写操作。

## 开发与验证

```bash
npm test
npm run test:coverage
npm run smoke
npm run check
```

GitHub Actions 会在 Node.js 22 和 24 上运行测试。真实 ChatGPT 接口是私有接口，发布前仍需要使用已登录的测试账号做一次 preview 集成检查。

## 技术要求

- Node.js 22 或更新版本。
- Chrome 或兼容 Chrome DevTools Protocol 的 Chromium 浏览器。
- 一个已登录 `chatgpt.com` 的调试页面。

## 限制

GPT Sorter 使用 ChatGPT 网页端内部接口。这些接口没有稳定性承诺，未来可能需要更新。参见 `gpt-sorter/references/private_api.md`。

## License

MIT

## Contributors

| Contributor | Contribution |
| --- | --- |
| Hank Yang | Product direction and maintenance |
| OpenAI Codex | Implementation, safety hardening, tests, and documentation assistance |
