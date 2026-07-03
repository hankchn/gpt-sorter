<p align="center"><b>简体中文</b> | <a href="./README_en.md">English</a></p>

# GPT Sorter

一个可复用的 Codex Skill，用来把 ChatGPT 网页端的历史对话批量整理到已有项目中。

它的核心原则是：只移动有把握的对话。脚本会先读取当前登录的 ChatGPT 网页会话，拉取已有 Projects 和标题列表，生成预览计划；只有在用户显式确认后，才把计划中的对话移动到已有项目。

## 能做什么

- 读取当前登录的 ChatGPT 网页会话，不要求用户导出数据。
- 拉取已有 ChatGPT Projects 和最近或全部可见历史对话。
- 根据标题规则和精确标题映射生成移动计划。
- 默认输出人类可读摘要，也可以用 `--json` 输出完整 JSON。
- 支持 `--out <file>` 保存 preview / execute 报告。
- 只移动到已有项目，不自动创建项目文件夹。
- 默认不读取对话正文，不保存 cookies、本地存储或访问令牌。

## 快速开始

1. 打开一个带调试端口的 Chrome，并登录 ChatGPT：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9777 --user-data-dir=/tmp/gpt-sorter
```

2. 在 Chrome 中打开 `https://chatgpt.com` 并确认已经登录。

3. 首次建议只扫描 20 条，确认规则方向：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan 20
```

4. 如需自定义规则，复制并修改 Skill 目录内的示例：

```bash
cp gpt-sorter/examples/rules.example.json work/chatgpt-rules.json
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan 20 --rules work/chatgpt-rules.json
```

5. 扩大范围并保存预览报告：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan all --rules work/chatgpt-rules.json --out work/gpt-sorter-preview.json
```

6. 用户核对 `plannedCount` 后再执行。`--confirm-count` 必须与本次计划数量完全一致：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs execute --scan all --rules work/chatgpt-rules.json --confirm-count 12 --out work/gpt-sorter-execute.json
```

## 作为 Skill 使用

把 `gpt-sorter/` 放入 Codex 的 skills 目录后，可以这样触发：

```text
Use $gpt-sorter to preview and batch move my ChatGPT conversations into existing projects.
```

只安装 `gpt-sorter/` 目录时，示例规则仍然在 Skill 内：

```bash
node scripts/gpt_sorter.mjs preview --scan 20 --rules examples/rules.example.json
```

Skill 会按以下顺序工作：

1. 确认整理范围：建议先 `--scan 20`，确认后再扩大到 `--scan all`。
2. 根据已有项目和标题生成或调整分类规则。
3. 先输出预览摘要和跳过原因。
4. 等待用户核对 `plannedCount`，再带 `--confirm-count <N>` 或 `--confirm-plan` 执行。
5. 执行后保存报告，并再次 preview 验证剩余条目。

## 规则示例

```json
{
  "rules": [
    { "project": "工作", "match": ["会议", "路线图", "需求", "复盘"] },
    { "project": "学习", "match": ["课程", "笔记", "教程", "概念"] },
    { "project": "写作", "match": ["草稿", "大纲", "标题", "改写"] }
  ],
  "exact": {
    "季度规划讨论": "工作"
  }
}
```

`match` 使用大小写不敏感的正则片段；`exact` 精确标题映射优先级最高，并且可以覆盖空标题保护，因为它代表用户显式确认。

## 安全分类规则

- `exact` 标题映射最高优先级。
- 非 `exact` 情况下会收集所有命中的规则。
- 0 个命中：跳过为 `no-confident-project`。
- 1 个命中：进入 planned。
- 多个命中：跳过为 `ambiguous-multiple-rules`，并输出候选项目。
- `New chat`、空标题、`Untitled`、极短标题默认跳过为 `semantic-empty-title`。
- 宽泛正则如 `.*` 不会移动 `New chat`。

## 规则文件校验

preview / execute 会先在本地校验规则文件：

- `rules` 必须是数组。
- 每个 rule 必须有非空 `project`。
- `match` 必须是字符串数组。
- `exact` 必须是 `{ "title": "project" }` 对象。
- 正则编译失败会输出 `configErrors`，preview 停止，execute 拒绝执行。

## CLI 选项

```bash
node gpt-sorter/scripts/gpt_sorter.mjs --help
```

常用选项：

- `--cdp <url>`：Chrome DevTools endpoint，默认 `http://127.0.0.1:9777`。
- `--page-id <id>`：从 `/json/list` 使用指定页面 target。
- `--scan all` 或 `--scan 100`：扫描全部可见历史或前 N 条。
- `--rules <file>`：规则文件。
- `--out <file>`：保存 JSON 报告。
- `--json`：在终端输出完整 JSON。
- `--max-preview-items <N>`：控制人类摘要展示样例数量。
- `--include-archived`、`--include-starred`、`--include-in-project`：扩大扫描范围。

默认安全策略只处理未归档、未收藏、未进入项目的普通历史对话。

## 辅助命令

生成规则草稿，不会移动任何对话：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs suggest-rules --scan 50 --out work/suggested-rules.json
```

如果 execute 报告里有成功移动记录，可以用报告回滚到原 `gizmo_id`：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs rollback --plan work/gpt-sorter-execute.json --confirm-count 12
```

## 私有接口说明

这个 Skill 使用 ChatGPT 网页端内部接口，包括项目列表、对话列表和对话项目更新接口。接口不稳定，未来可能变化。失败时应停止、重新 preview，不要盲目重试 destructive operation。相关记录见 `gpt-sorter/references/private_api.md`。

## 安全与隐私

- 不读取或保存浏览器 cookies。
- 不把访问令牌返回到 Node 进程或日志。
- 默认只基于标题分类，不读取对话正文。
- execute 必须带 `--confirm-count <N>` 或 `--confirm-plan`。
- execute 报告包含对话 id、标题、原项目、目标项目、状态和错误，便于审计和回滚。
- 只移动到已有项目，不创建或删除项目。

## 技术要求

- Node.js 22 或更新版本。
- 一个已登录 ChatGPT 的 Chrome 页面。
- Chrome DevTools Protocol 端口，默认 `http://127.0.0.1:9777`。

## License

MIT

## Contributors

Created by hankchn with OpenAI Codex.
