# Dependency-Graph Skill 工具文档

本目录 `.claude/skills/dependency-graph/` 提供一套**完全自包含**的静态扫描工具，用于在 ECC(Everything Claude Code)仓库的 `rules/`、`agents/`、`skills/`、`commands/`、`hooks/` 之间构建并查询依赖关系图，同时按 `manifests/install-modules.json` 的安装模块给 skill 打分类标签，支持"按类别浏览"。它的核心目标是：在删除、重命名或拆分某个组件之前，能先确定有谁依赖它，避免悄无声息地破坏引用。

> **设计原则**：所有脚本对 `.claude/skills/dependency-graph/` 之外的仓库文件只做只读访问——包括只读 require `scripts/ci/generate-command-registry.js` 的导出函数、只读解析 `manifests/install-modules.json`；所有写操作都只落在本目录内。运行它不会污染或修改仓库其他文件。

---

## 内容导航

- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [脚本 × 支持标志速查](#脚本--支持标志速查)
- [npm scripts 速查](#npm-scripts-速查)
- [工具/脚本详细说明](#工具脚本详细说明)
- [输出数据格式与字段含义](#输出数据格式与字段含义)
- [overrides.json 用法](#overridesjson-抑制误报与补充遗漏)
- [常见工作流](#常见工作流)
- [FAQ / 故障排查](#faq--故障排查)
- [已知局限](#已知局限)
- [自测](#自测)

---

## 目录结构

```text
.claude/skills/dependency-graph/
├── SKILL.md                      # 用户层面的 skill 介绍（何时用、怎么用）
├── README.md                     # 本文件：工具、脚本、数据格式、字段说明
├── package.json                  # 本地 npm scripts，不影响仓库根目录
├── overrides.json                # 人工覆盖/补充依赖关系
├── DEPENDENCY-GRAPH.md           # 生成的人可读依赖报告（别手改，用 `npm run render` 重新生成）
├── data/                         # 生成的数据产物
│   ├── rule-registry.json
│   ├── skill-registry.json
│   ├── agent-registry.json
│   ├── hook-registry.json
│   └── graph.json
├── scripts/                      # 工具脚本
│   ├── generate-rule-registry.js
│   ├── generate-skill-registry.js
│   ├── generate-agent-registry.js
│   ├── generate-hook-registry.js
│   ├── relationship-graph.js
│   ├── relationship-query.js
│   ├── relationship-render.js
│   ├── self-test.js
│   └── lib/
│       ├── reference-helpers.js  # 引用解析辅助函数
│       └── registry-cli.js       # 4 个 generator 共用的 CLI 样板
```

---

## 快速开始

所有命令都在仓库根目录下执行即可，不需要安装任何 npm 依赖；如果想用 npm script，也可以先 `cd .claude/skills/dependency-graph`。

```bash
# 一次性刷新所有数据和报告（最常用）
node .claude/skills/dependency-graph/scripts/relationship-graph.js --write
node .claude/skills/dependency-graph/scripts/relationship-render.js --write

# 或者进入目录后用 npm script
npm run refresh
```

```bash
# 查询谁依赖某个组件
node .claude/skills/dependency-graph/scripts/relationship-query.js dependents skill:react-patterns

# 查询某个组件自己引用了什么
node .claude/skills/dependency-graph/scripts/relationship-query.js uses skill:react-patterns

# 查看所有孤儿引用（目标不存在的引用）
node .claude/skills/dependency-graph/scripts/relationship-query.js orphans

# 查看自测是否通过
node .claude/skills/dependency-graph/scripts/self-test.js
```

---

## 脚本 × 支持标志速查

下表列出每个脚本支持的命令行标志，方便快速确认能用什么参数：

| 脚本 | `--json` | `--write` | `--check` | 说明 |
|---|---|---|---|---|
| `generate-rule-registry.js` | ✅ | ✅ | ✅ | 默认：打印摘要 |
| `generate-skill-registry.js` | ✅ | ✅ | ✅ | 默认：打印摘要 |
| `generate-agent-registry.js` | ✅ | ✅ | ✅ | 默认：打印摘要 |
| `generate-hook-registry.js` | ✅ | ✅ | ✅ | 默认：打印摘要 |
| `relationship-graph.js` | ✅ | ✅ | ✅ | 默认：打印节点数/边数/孤儿数 |
| `relationship-query.js` | ✅ | ❌ | ❌ | 用 `--json` 输出可机器消费的 JSON |
| `relationship-render.js` | ❌ | ✅ | ✅ | 默认：输出 Markdown 到 stdout |
| `self-test.js` | ❌ | ❌ | ❌ | 无参数，成功打印并通过，失败报错 |

---

## 工具/脚本详细说明

### 1. `generate-rule-registry.js`

**作用**：扫描 `rules/**/*.md`，提取每个 rule 的元数据以及它引用的 agent、skill 和 extends 继承关系。

**输出**：`data/rule-registry.json`

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/generate-rule-registry.js
# 输出节点/边数量等摘要

node .claude/skills/dependency-graph/scripts/generate-rule-registry.js --write
# 写入 data/rule-registry.json

node .claude/skills/dependency-graph/scripts/generate-rule-registry.js --check
# 检查 data/rule-registry.json 是否最新，过期则报错
```

### 2. `generate-skill-registry.js`

**作用**：扫描 `skills/*/SKILL.md`，提取每个 skill 的描述以及它引用的 agent、skill。

**输出**：`data/skill-registry.json`

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/generate-skill-registry.js
node .claude/skills/dependency-graph/scripts/generate-skill-registry.js --write
node .claude/skills/dependency-graph/scripts/generate-skill-registry.js --check
```

### 3. `generate-agent-registry.js`

**作用**：扫描 `agents/*.md`，提取每个 agent 的 `model`、`tools` 以及它引用的 agent、skill。

**输出**：`data/agent-registry.json`

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/generate-agent-registry.js
node .claude/skills/dependency-graph/scripts/generate-agent-registry.js --write
node .claude/skills/dependency-graph/scripts/generate-agent-registry.js --check
```

### 4. `generate-hook-registry.js`

**作用**：扫描 `hooks/hooks.json` 和 `hooks/*/hooks.json`，提取每个 hook 的 `id`、触发事件、匹配器、描述以及它引用的脚本，并检查脚本文件是否真实存在。

**输出**：`data/hook-registry.json`

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/generate-hook-registry.js
node .claude/skills/dependency-graph/scripts/generate-hook-registry.js --write
node .claude/skills/dependency-graph/scripts/generate-hook-registry.js --check
```

### 5. `relationship-graph.js`

**作用**：合并前 4 个 registry + 命令注册表（`scripts/ci/generate-command-registry.js`），构建一张统一的依赖图。它是整套工具的数据中枢。

**输出**：`data/graph.json`

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/relationship-graph.js
# 输出节点数、边数、孤儿引用数

node .claude/skills/dependency-graph/scripts/relationship-graph.js --json
# 输出完整 JSON 到 stdout

node .claude/skills/dependency-graph/scripts/relationship-graph.js --write
# 写入 data/graph.json

node .claude/skills/dependency-graph/scripts/relationship-graph.js --check
# 检查 data/graph.json 是否最新
```

**核心 API**（供其他脚本 `require`）：

- `buildGraph(root)`：从指定仓库根目录构建图对象 `{ nodes: Map, edges: [] }`。
- `findDependents(graph, id)`：返回依赖 `id` 的节点列表，形如 `{ from, type }`。
- `findUses(graph, id)`：返回 `id` 依赖的节点列表，形如 `{ to, type }`。
- `findOrphans(graph)`：返回目标节点不存在的引用列表，形如 `{ from, to, type }`。
- `toSerializable(graph)`：把含 `Map` 的图对象转成可 JSON 序列化的结构。

### 6. `relationship-query.js`

**作用**：基于 `data/graph.json` 提供命令行查询。

**子命令**：

| 子命令 | 作用 | 示例 |
|---|---|---|
| `dependents <id> [--json]` | 查询谁依赖这个节点 | `dependents skill:react-patterns` |
| `uses <id> [--json]` | 查询这个节点依赖谁 | `uses agent:planner` |
| `orphans [--json]` | 列出所有孤儿引用 | `orphans` |
| `graph --from <id> [--depth <n>] [--json]` | 输出局部关系图的 mermaid 代码块 | `graph --from agent:planner --depth 1` |

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/relationship-query.js dependents skill:react-patterns
node .claude/skills/dependency-graph/scripts/relationship-query.js dependents skill:react-patterns --json
node .claude/skills/dependency-graph/scripts/relationship-query.js uses agent:planner
node .claude/skills/dependency-graph/scripts/relationship-query.js orphans
node .claude/skills/dependency-graph/scripts/relationship-query.js orphans --json
node .claude/skills/dependency-graph/scripts/relationship-query.js graph --from agent:planner --depth 1
```

**全局标志 `--json`**：所有子命令都支持 `--json`，输出可机器消费的 JSON 数组，方便在 CI 或其他脚本里解析。例如：

```bash
node .claude/skills/dependency-graph/scripts/relationship-query.js orphans --json
```

**`graph --depth` 的默认值与边界**：`--depth` 省略时默认为 `2`；有效范围是 **1~10**，超出范围会报错 `--depth 必须是 1 到 10 之间的整数`。

### 7. `relationship-render.js`

**作用**：把 `data/graph.json` 渲染成人可读的 `DEPENDENCY-GRAPH.md`。

**输出**：`DEPENDENCY-GRAPH.md`

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/relationship-render.js
# 输出 Markdown 到 stdout

node .claude/skills/dependency-graph/scripts/relationship-render.js --write
# 写入 DEPENDENCY-GRAPH.md

node .claude/skills/dependency-graph/scripts/relationship-render.js --check
# 检查 DEPENDENCY-GRAPH.md 是否最新
```

### 8. `self-test.js`

**作用**：在临时目录中构造一个最小的 fixture 仓库，验证所有 generator 和图逻辑能正确识别依赖、继承和孤儿引用。

**执行方式**：

```bash
node .claude/skills/dependency-graph/scripts/self-test.js
```

成功时打印 `self-test: 全部断言通过` 并退出码为 `0`；失败会打印错误并退出码非 `0`。

---

## npm scripts 速查

如果你选择进入 `.claude/skills/dependency-graph/` 目录运行 npm，可以用以下脚本：

| 脚本 | 作用 |
|---|---|
| `npm run generate:rules` | 刷新 `data/rule-registry.json` |
| `npm run generate:skills` | 刷新 `data/skill-registry.json` |
| `npm run generate:agents` | 刷新 `data/agent-registry.json` |
| `npm run generate:hooks` | 刷新 `data/hook-registry.json` |
| `npm run generate:graph` | 刷新 `data/graph.json` |
| `npm run generate:all` | 依次刷新 4 个 registry + graph |
| `npm run render` | 重新生成 `DEPENDENCY-GRAPH.md` |
| `npm run refresh` | `generate:all` + `render`（最常用） |
| `npm run query:orphans` | 查询当前孤儿引用 |
| `npm test` | 运行 `self-test.js` |

---

## 输出数据格式与字段含义

### 节点 ID 格式

所有节点使用统一 ID 格式，方便在命令行和 JSON 中引用：

| 类型 | ID 格式 | 示例 |
|---|---|---|
| rule | `rule:<相对于 rules/ 的路径>` | `rule:java/coding-style.md` |
| skill | `skill:<skill 名字>` | `skill:react-patterns` |
| agent | `agent:<agent 名字>` | `agent:planner` |
| command | `command:<command 名字>` | `command:plan` |
| hook | `hook:<id>` | `hook:pre:bash:dispatcher` |
| module | `module:<manifests/install-modules.json 里的 module id>` | `module:framework-language` |
| script | `script:<相对路径>` | `script:scripts/hooks/pre-bash-dispatcher.js` |

### `data/rule-registry.json`

```json
{
  "schemaVersion": 1,
  "totalRules": 122,
  "rules": [
    {
      "rule": "angular/coding-style.md",
      "path": "rules/angular/coding-style.md",
      "paths": ["**/*.component.ts", "**/*.service.ts"],
      "extends": "common/coding-style.md",
      "agents": ["security-reviewer"],
      "skills": ["angular-developer"]
    }
  ]
}
```

字段含义：

- `rule`：rule 文件在 `rules/` 下的相对路径，用作节点 ID 的后半部分。
- `path`：rule 文件在仓库根目录下的相对路径。
- `paths`：frontmatter 中的 `paths` 数组，表示该 rule 匹配哪些文件路径。
- `extends`：该 rule 继承的父 rule 相对路径（可为 `null`）。
- `agents`：该 rule 文档中引用的 agent 名称列表。
- `skills`：该 rule 文档中引用的 skill 名称列表。

### `data/skill-registry.json`

```json
{
  "schemaVersion": 1,
  "totalSkills": 278,
  "skills": [
    {
      "skill": "accessibility",
      "path": "skills/accessibility/SKILL.md",
      "description": "Design, implement, and audit inclusive digital products...",
      "agents": [],
      "skills": []
    }
  ]
}
```

字段含义：

- `skill`：skill 名称，对应 `skills/<name>/SKILL.md` 目录名。
- `path`：SKILL.md 文件在仓库根目录下的相对路径。
- `description`：SKILL.md frontmatter 中的 `description`。
- `agents`：该 skill 文档中显式引用的 agent 名称列表。
- `skills`：该 skill 文档中引用的其他 skill 名称列表。

### `data/agent-registry.json`

```json
{
  "schemaVersion": 1,
  "totalAgents": 67,
  "agents": [
    {
      "agent": "planner",
      "path": "agents/planner.md",
      "model": "sonnet",
      "tools": "[\"Read\", \"Grep\", \"Glob\"]",
      "agents": ["code-reviewer"],
      "skills": ["plan-orchestrate"]
    }
  ]
}
```

字段含义：

- `agent`：agent 名称（文件名去掉 `.md`）。
- `path`：agent 文件在仓库根目录下的相对路径。
- `model`：frontmatter 中的 `model` 字段。
- `tools`：frontmatter 中的 `tools` 字段（原始字符串）。
- `agents`：该 agent 文档中引用的其他 agent 名称列表。
- `skills`：该 agent 文档中引用的 skill 名称列表。

### `data/hook-registry.json`

```json
{
  "schemaVersion": 1,
  "totalHooks": 29,
  "hooks": [
    {
      "id": "pre:bash:dispatcher",
      "event": "PreToolUse",
      "matcher": "Bash",
      "description": "Consolidated Bash preflight dispatcher...",
      "sourceFile": "hooks/hooks.json",
      "scripts": [
        { "path": "scripts/hooks/plugin-hook-bootstrap.js", "exists": true }
      ]
    }
  ]
}
```

字段含义：

- `id`：hook 的全局唯一标识（可为空，为空时代表只是配置示例）。
- `event`：触发事件，如 `PreToolUse`、`PostToolUse`。
- `matcher`：匹配的工具名或 glob，如 `Bash`、`Edit|Write`。
- `description`：hook 的描述文本。
- `sourceFile`：该 hook 定义所在的 hooks.json 文件路径。
- `scripts`：该 hook 引用的脚本文件列表。
  - `path`：脚本相对路径。
  - `exists`：脚本文件当前是否真实存在。

### `data/graph.json`

这是统一依赖图，合并了上述所有 registry 和 command registry。结构为：

```json
{
  "schemaVersion": 1,
  "nodes": [
    {
      "id": "rule:angular/coding-style.md",
      "type": "rule",
      "name": "angular/coding-style.md",
      "path": "rules/angular/coding-style.md",
      "meta": { "paths": [...] }
    }
  ],
  "edges": [
    {
      "from": "rule:angular/coding-style.md",
      "to": "rule:common/coding-style.md",
      "type": "extends"
    },
    {
      "from": "rule:angular/coding-style.md",
      "to": "skill:angular-developer",
      "type": "references_skill"
    }
  ]
}
```

字段含义：

- `nodes`：所有节点数组。
  - `id`：统一节点 ID。
  - `type`：节点类型（`rule`、`skill`、`agent`、`command`、`hook`、`script`）。
  - `name`：节点的名称/路径片段。
  - `path`：对应文件在仓库根目录下的相对路径。
  - `meta`：类型相关的额外元数据（如 rule 的 `paths`、skill 的 `description`、agent 的 `model`/`tools`、hook 的 `event`/`matcher`）。
- `edges`：所有引用关系数组。
  - `from`：引用来源节点 ID。
  - `to`：引用目标节点 ID。
  - `type`：关系类型，见下方“边的类型”表格。

### 边的类型

| 类型 | 含义 | 典型场景 |
|---|---|---|
| `extends` | rule 继承 | `rule:angular/coding-style.md` → `rule:common/coding-style.md` |
| `references_agent` | 引用某个 agent | `skill:plan-orchestrate` → `agent:planner` |
| `references_skill` | 引用某个 skill | `rule:java/coding-style.md` → `skill:jpa-patterns` |
| `hook_script` | hook 引用某个脚本 | `hook:pre:bash:dispatcher` → `script:scripts/hooks/pre-bash-dispatcher.js` |
| `installs_skill` | install module 打包了某个 skill(只读复用 `manifests/install-modules.json`) | `module:framework-language` → `skill:react-patterns` |
| `manual` | 人工补充的边（来自 `overrides.json`）；`manual` 条目可指定任意 `type`，省略时退化为字面值 `manual` | 任意 |

### `DEPENDENCY-GRAPH.md`

这是 `relationship-render.js` 生成的人可读报告，包含：

1. **节点统计**：各类型节点数量、边总数。
2. **按类别浏览**：skill 按 `manifests/install-modules.json` 的 module 分组（覆盖率不是 100%，未被任何 module 收录的会计入"未归类"）；command 按已推断的 `type` 分组；hook 按触发事件（event）分组；rule 按 `rules/` 一级目录（语言/主题）分组；agent 目前没有分类数据源，只给出用 `dependents`/`uses` 查关系的提示。
3. **rules/ 的 extends 继承关系**：按被继承目标分组，列出所有继承者。
4. **被引用最多的 skill**：前 5 名各配一张 depth 1 的 mermaid 局部关系图（GitHub 网页会直接渲染成图），第 6~15 名保留一张表格。
5. **被引用最多的 agent**：结构同上。
6. **孤儿引用**：目标节点不存在的边，表格列出 `from` / `to` / `type`。
7. **使用说明**：如何查询依赖、使用局部关系图等。

> 为什么不是给全仓库画一张大图：616 个节点、479 条边不管用什么工具画出来都是一团看不出结构的线，只有把范围收窄到某一个节点的局部邻域（depth 1~2）才是真的看得懂的图。所以报告里只给最重要的几个枢纽节点画图，其余仍然是表格；想看任意节点的局部图，用 `relationship-query.js graph --from <id> --depth <n>`。

> 注意：该文件顶部有 `（自动生成，请勿手改）` 提示，应始终通过 `npm run render` 或 `node relationship-render.js --write` 重新生成。

---

## `overrides.json`：抑制误报与补充遗漏

```json
{
  "_readme": ".claude/skills/dependency-graph 的人工覆盖配置。",
  "suppress": [
    {
      "from": "skill:plan-orchestrate",
      "to": "agent:reviewer-class",
      "type": "references_agent",
      "note": "reviewer-class 是描述性类别，不是具体 agent"
    }
  ],
  "manual": [
    {
      "from": "skill:x",
      "to": "skill:y",
      "type": "references_skill",
      "note": "为什么补充这条边"
    }
  ]
}
```

字段含义：

- `suppress`：让某条边从图里消失。用于已确认的误报。
  - `from`、`to`、`type`：必须匹配 `data/graph.json` 中的某条边。
  - `note`：可选，说明为什么 suppress。
- `manual`：补充静态扫描识别不出来的引用。
  - `from`、`to`、`type`：必填。
  - `note`：可选，建议写清楚原因。

`relationship-graph.js` 在 `overrides.json` 不存在时会静默跳过，不会报错。因此这个文件是可选的，只有需要人工干预时才创建/修改。

---

## 常见工作流

### 工作流 1：删除某个 skill 前确认影响范围

```bash
node .claude/skills/dependency-graph/scripts/relationship-query.js dependents skill:react-patterns
```

如果输出为空，说明用当前这套启发式规则没扫到任何 rule/agent/command/skill 引用它——这是个降低风险的信号，不是"绝对没人用"的证明（见[已知局限](#已知局限)第 1 条，裸的自然语言提及可能漏判）；如果有输出，需要评估是否一并修改这些依赖方。对影响面大、拿不准的组件，删除前建议再手动搜一遍仓库全文确认。

### 工作流 2：改动后检查是否有孤儿引用

```bash
npm run refresh
node .claude/skills/dependency-graph/scripts/relationship-query.js orphans
```

如果发现某条是误报，写进 `overrides.json` 的 `suppress`；如果是真正的死链接，修复源文档。

### 工作流 3：查看局部关系图

```bash
node .claude/skills/dependency-graph/scripts/relationship-query.js graph --from agent:planner --depth 1
```

输出是一段 mermaid 代码块，可以贴到支持 mermaid 的 Markdown 查看器或 GitHub issue 里直接渲染。

### 工作流 4：在 CI 中检查数据是否最新

```bash
node .claude/skills/dependency-graph/scripts/generate-rule-registry.js --check
node .claude/skills/dependency-graph/scripts/generate-skill-registry.js --check
node .claude/skills/dependency-graph/scripts/generate-agent-registry.js --check
node .claude/skills/dependency-graph/scripts/generate-hook-registry.js --check
node .claude/skills/dependency-graph/scripts/relationship-graph.js --check
node .claude/skills/dependency-graph/scripts/relationship-render.js --check
```

任何一条 `--check` 失败，说明提交者没有重新生成产物。

---

## 已知局限

1. **引用识别是启发式正则，不是完整语法解析。** 它能识别显式标记（如 `` `skill:react-patterns` ``、`agents/planner.md`、`subagent_type: planner`），但可能误判或漏判自然语言中的引用。**这意味着 `dependents` 的结果只是参考信号，不是"删除绝对安全"的证明**——查出来是空的，只说明没扫到已知形式的引用，不代表 100% 没人依赖；影响面大的组件，删除前最好再人工搜一遍确认。
2. **外部引用会被报告为孤儿。** 仓库外部 skill（如 OKX 官方 skill）、用户个人 `.claude/skills/` 下的 skill、Claude 内置 agent 类型（如 `general-purpose`）不在本仓库 registry 中，因此目标节点不存在，会被列为孤儿。这是预期行为。
3. **描述性类别可能被误判。** 像 "a **reviewer-class** agent" 这种描述性短语会被识别为对 `agent:reviewer-class` 的引用，需要写进 `overrides.json` suppress。
4. **`hook-config:<sourceFile>` 是一种伪节点。** 当 `hooks.json` 里的某个条目没有 `id` 字段时（通常是示例/参考配置），`relationship-graph.js` 会用 `hook-config:<sourceFile>` 作为来源 id，把该条目引用的不存在的脚本上报为孤儿引用。这个伪节点不会出现在 `graph.json` 的 `nodes` 里，也无法通过 `dependents`/`uses` 查询到，只在孤儿列表里可见。
5. **--check 不自动刷新。** 它只是比较当前文件内容和重新生成后应该得到的内容是否一致，过期需要手动 `--write` 或 `npm run refresh`。
6. **skill 分类数据覆盖率不是 100%。** `manifests/install-modules.json` 是给其他 harness（cursor/codebuddy/qwen 等）用的选择性安装清单，不是专门维护的分类表；278 个 skill 里只有 198 个被某个 module 的 `installs_skill` 边收录（其中 1 个来自 `kind` 并非 `"skills"` 的 `orchestration` module，它只是恰好也打包了 `skill:dmux-workflows`，这 1 个已经计入 198，不是额外的），剩下 80 个会在"按类别浏览"里计入"未归类"，不代表它们有问题。另外，Claude Code 插件市场安装走的是 `.claude-plugin/plugin.json`，它对 `skills/` 是整目录引用，不受这份清单的覆盖率影响。
7. **rules/agents/commands/hooks 在 `install-modules.json` 里没有逐项粒度。** 这四类都是整目录/固定文件引用（比如 `rules-core` module 的 `paths` 就是 `["rules"]`），所以只有 skill 才会通过 `installs_skill` 边体现在图里；agent 目前没有任何分类数据源。

---

## FAQ / 故障排查

### Q1：孤儿引用列表里出现明显不该有的条目怎么办？

先判断它属于哪一类：

- **外部引用**：指向仓库外部 skill、用户个人 `.claude/skills/` 下的 skill，或 Claude 内置 agent 类型。这是预期行为，不是 bug。
- **已确认的误报**：比如描述性短语被正则误判成具体引用。把它写进 `overrides.json` 的 `suppress` 列表，下次 `npm run refresh` 就不会再出现。
- **真正的死链接**：源文档里确实引用了已经不存在的组件。直接修复源文档，然后 `npm run refresh`。

### Q2：`graph --depth` 报错“必须是 1 到 10 之间的整数”是什么意思？

`--depth` 的有效范围是 **1~10**，省略时默认是 `2`。如果写了 `--depth 0` 或 `--depth 20` 就会触发这个错误。改成范围内的整数即可。

### Q3：怎么在 CI 脚本里用 JSON 输出做自动化？

`relationship-query.js` 的所有子命令都支持 `--json`，输出 JSON 数组，可直接被 `jq` 或其他脚本解析：

```bash
# 检查是否存在孤儿引用
node .claude/skills/dependency-graph/scripts/relationship-query.js orphans --json | jq 'length'
```

如果值大于 0，说明还有未处理的孤儿引用，可以让 CI 失败。

### Q4：为什么 `dependents`/`uses` 查不到 `hook-config:xxx`？

`hook-config:<sourceFile>` 是专门为“没有 id 的 hook 条目引用了不存在脚本”而生成的伪来源。它不是一个真实节点，因此不会出现在 `graph.json` 的 `nodes` 中，也不会参与 `dependents`/`uses` 查询。你只能在 `orphans` 列表里看到它。

---

## 自测

运行自测脚本会生成临时目录，构造一个假仓库，验证：

- rule extends 继承关系被正确识别。
- skill 对 agent/skill 的引用被正确识别。
- hook 对脚本的引用以及脚本是否存在被正确识别。
- 孤儿引用被正确检测。

```bash
node .claude/skills/dependency-graph/scripts/self-test.js
```
