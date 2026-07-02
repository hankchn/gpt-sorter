<p align="center"><b>简体中文</b> | <a href="./README_en.md">English</a></p>

# GPT Sorter

一个可复用的 Codex Skill，用来把 ChatGPT 网页端的历史对话批量整理到已有项目中。

它沉淀自一次真实整理流程：先通过浏览器会话观察 ChatGPT 私有接口，再根据用户确认的分类规则预览待移动列表，最后只移动确定能匹配到已有项目的对话。没有对应项目、已经在项目里、标题语义不清的对话都会默认跳过。

## 能做什么

- 读取当前登录的 ChatGPT 网页会话，不要求用户导出数据。
- 拉取已有 ChatGPT Projects 和最近或全部可见历史对话。
- 根据标题规则和精确标题映射生成移动计划。
- 先预览，再执行，执行后再次预览确认剩余未移动原因。
- 只移动到已有项目，不自动创建项目文件夹。
- 默认不读取对话正文，不保存 cookies、本地存储或访问令牌。

## 快速开始

1. 打开一个带调试端口的 Chrome，并登录 ChatGPT：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9777 --user-data-dir=/tmp/gpt-sorter
```

2. 在 Chrome 中打开 `https://chatgpt.com` 并确认已经登录。

3. 进入仓库根目录后预览分类结果：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan all
```

4. 如需自定义规则，复制 `examples/rules.example.json` 后修改项目名和关键词：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs preview --scan all --rules examples/rules.example.json
```

5. 用户确认预览列表后再执行：

```bash
node gpt-sorter/scripts/gpt_sorter.mjs execute --scan all --rules examples/rules.example.json
```

## 作为 Skill 使用

把 `gpt-sorter/` 放入 Codex 的 skills 目录后，可以这样触发：

```text
Use $gpt-sorter to preview and batch move my ChatGPT conversations into existing projects.
```

Skill 会按以下顺序工作：

1. 确认整理范围：最近 N 条或全部可见历史。
2. 根据已有项目和标题生成分类规则。
3. 先输出预览移动列表和跳过原因。
4. 等待用户明确说 `确认` 或 `执行`。
5. 执行移动，并再次预览验证剩余条目。

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

`match` 使用大小写不敏感的正则片段；`exact` 精确标题映射优先级最高。

## 默认跳过规则

- 已经属于某个项目的对话。
- 目标项目不存在的匹配结果。
- 没有命中规则的标题。
- `New chat` 这类无语义标题。
- 用户未确认的模糊分类。

## 私有接口说明

这个 Skill 使用 ChatGPT 网页端内部接口，包括项目列表、对话列表和对话项目更新接口。接口不稳定，未来可能变化。相关记录见 `gpt-sorter/references/private_api.md`。

## 安全与隐私

- 不读取或保存浏览器 cookies。
- 不把访问令牌返回到 Node 进程或日志。
- 默认只基于标题分类，不读取对话正文。
- 执行移动前必须先预览并得到用户确认。
- 只移动到已有项目，不创建或删除项目。

## 技术要求

- Node.js 22 或更新版本。
- 一个已登录 ChatGPT 的 Chrome 页面。
- Chrome DevTools Protocol 端口，默认 `http://127.0.0.1:9777`。

## License

MIT

## Contributors

Created by hankchn with OpenAI Codex.
