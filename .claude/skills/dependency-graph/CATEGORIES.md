# 仓库组件分类参考

> 这份文档是 `dependency-graph` 技能的配套参考资料。它把仓库里的 `agents/`、`commands/`、`skills/`、`rules/` 全部组件按**功能主题**和**用户场景**两个维度做了归类，目的是在你用 `dependency-graph` 浏览/清理/重命名组件时能快速定位。
>
> 数据基线：仓库 561 个组件（agents 67 + commands 94 + skills 278 + rules 122），对照 `data/*-registry.json` 重新核对，2026-07-11。
> 数据源：
> - 目录扫描：`agents/` `commands/` `skills/` `rules/` 下所有 `.md`
> - 官方分类：`manifests/install-modules.json`（按 install module 分组，覆盖约 277/278 的 skill）
>
> 这不是权威分类，是辅助浏览。权威来源见 `manifests/install-modules.json`。
>
> **本文档只做功能/场景分类，不做"要不要保留"的判断。** 组件是否该排除出仓库的决策记录在 [`decisions.json`](data/decisions.json)（见 [DECISIONS.md](DECISIONS.md)），那是一份会随决策变化持续更新的决策台账，不适合和这份静态的分类快照混在一起维护。

---

## 目录

- [一、按组件类型（基础结构）](#一按组件类型基础结构)
- [二、按功能主题分类](#二按功能主题分类)
  - [2.1 架构设计与规划](#21-架构设计与规划)
  - [2.2 代码开发工作流（TDD / 重构 / 修Bug）](#22-代码开发工作流tdd--重构--修bug)
  - [2.3 代码审查与质量](#23-代码审查与质量)
  - [2.4 语言/技术栈专属模式](#24-语言技术栈专属模式)
  - [2.5 数据与基础设施](#25-数据与基础设施)
  - [2.6 Agent 系统 / 多代理编排 / 循环](#26-agent-系统--多代理编排--循环)
  - [2.7 安全 / 合规 / 测试](#27-安全--合规--测试)
  - [2.8 插件生态自身的元工具](#28-插件生态自身的元工具)
  - [2.9 文档 / 学习 / 知识沉淀](#29-文档--学习--知识沉淀)
  - [2.10 网络 / DevOps / 基础设施](#210-网络--devops--基础设施)
  - [2.11 搜索 / 研究 / 数据采集](#211-搜索--研究--数据采集)
  - [2.12 产品 / 营销 / 增长](#212-产品--营销--增长)
  - [2.13 前端 UI / 设计 / 动画 / 媒体](#213-前端-ui--设计--动画--媒体)
  - [2.14 通信 / 通知 / 运维](#214-通信--通知--运维)
  - [2.15 行业专用](#215-行业专用)
  - [2.16 AI / Agent 工程方法论](#216-ai--agent-工程方法论)
  - [2.17 Misc / 较窄主题](#217-misc--较窄主题)
- [三、按用户使用场景分类](#三按用户使用场景分类)
- [四、rules/ 子目录结构（122 个）](#四rules-子目录结构122-个)
- [五、关键观察](#五关键观察)
- [六、与 dependency-graph 的关系](#六与-dependency-graph-的关系)

---

## 一、按组件类型（基础结构）

| 类型 | 节点 id 格式 | 数量 | 角色 | 是否可由用户主动调用 |
|------|------|------|------|---------------------|
| **agents** | `agent:<name>` | 67 | 专业子代理（Task 工具调用的 worker） | 否（被 Claude 调度） |
| **commands** | `command:<name>` | 94 | 斜杠命令（`/xxx`） | ✅ 用户主动 |
| **skills** | `skill:<name>` | 278 | 领域知识包（自动触发或菜单调用） | 部分 |
| **rules** | `rule:<path>` | 122 | 始终遵循的规则文件 | 否（始终加载） |

查询示例：

```bash
# 看 skill:react-patterns 的所有依赖方
node .claude/skills/dependency-graph/scripts/relationship-query.js dependents skill:react-patterns

# 看 agent:code-reviewer 自己引用了什么
node .claude/skills/dependency-graph/scripts/relationship-query.js uses agent:code-reviewer
```

---

## 二、按功能主题分类

> 这是依赖图之外的"语义"分类——dependency-graph 工具本身不提供这个维度。`install-modules.json` 已为部分 skill 提供 module id（`framework-language` / `database` / `workflow-quality` / `security` 等），下面的分类在 module 基础上做了补充和扩展。
>
> 这些分类不是互斥分区：一个组件如果功能横跨多个主题，会同时出现在对应的几节里（比如 `skill:council` 同时出现在"产品/营销/增长"和"AI/Agent 工程方法论"）。看到同一个组件在多节重复出现是有意的交叉引用，不是漏了去重。

### 2.1 架构设计与规划

**agents**
- `agent:architect` `agent:code-architect` `agent:planner` `agent:code-explorer`
- `agent:e2e-runner` `agent:spec-miner`

**skills**
- `skill:blueprint` `skill:architecture-decision-records` `skill:product-capability`
- `skill:intent-driven-development` `skill:hexagonal-architecture`

**commands**
- `command:plan` `command:plan-canvas` `command:plan-prd` `command:prp-plan` `command:prp-prd`
- 编排：`command:multi-plan` `command:orch-add-feature` `command:orch-build-mvp`

### 2.2 代码开发工作流（TDD / 重构 / 修Bug）

**agents**
- `agent:tdd-guide` `agent:refactor-cleaner` `agent:build-error-resolver`
- `agent:code-simplifier` `agent:comment-analyzer` `agent:silent-failure-hunter`
- `agent:type-design-analyzer` `agent:pr-test-analyzer` `agent:harness-optimizer`

**commands**
- TDD：`command:orch-fix-defect` `command:orch-add-feature` `command:orch-change-feature` `command:orch-refine-code` `command:orch-review`
- 重构：`command:refactor-clean` `command:simplify`
- 构建修复：`command:build-fix` `command:cpp-build` `command:go-build` `command:rust-build` `command:java-build` `command:react-build` `command:flutter-build` `command:kotlin-build` `command:swift-build` `command:dart-build-resolver`

**skills**
- `skill:tdd-workflow` `skill:coding-standards` `skill:error-handling` `skill:refactor-clean`
- `skill:verification-loop` `skill:plankton-code-quality`

### 2.3 代码审查与质量

**agents**
- 通用：`agent:code-reviewer` `agent:silent-failure-hunter` `agent:agent-evaluator`
- 按语言：`agent:python-reviewer` `agent:typescript-reviewer` `agent:java-reviewer` `agent:rust-reviewer` `agent:go-reviewer` `agent:cpp-reviewer` `agent:csharp-reviewer` `agent:vue-reviewer` `agent:react-reviewer` `agent:flutter-reviewer` `agent:kotlin-reviewer` `agent:swift-reviewer` `agent:php-reviewer` `agent:fsharp-reviewer`
- 其他：`agent:database-reviewer` `agent:mle-reviewer` `agent:healthcare-reviewer` `agent:security-reviewer` `agent:seo-specialist`

**commands**
- `command:code-review` `command:review-pr` `command:quality-gate` `command:test-coverage`
- 按语言：`command:python-review` `command:vue-review` `command:react-review` `command:cpp-review` `command:kotlin-review` `command:rust-review` `command:fastapi-review`

**skills**
- `skill:codehealth-mcp` `skill:code-tour` `skill:verification-loop` `skill:production-audit`

### 2.4 语言/技术栈专属模式

| 语言/栈 | 关键 skills | 关键 agents | 关键 commands |
|---------|-------------|-------------|---------------|
| **Java / Spring Boot** ⭐ | `springboot-patterns` `springboot-security` `springboot-tdd` `springboot-verification` `java-coding-standards` `jpa-patterns` | `java-reviewer` `java-build-resolver` | — |
| **Python** | `python-patterns` `python-testing` `fastapi-patterns` `generating-python-installer` | `python-reviewer` `fastapi-reviewer` | `python-review` |
| **TypeScript / Node** | `bun-runtime` `nodejs-keccak256` | `typescript-reviewer` | — |
| **React / Web** | `react-patterns` `react-testing` `react-performance` `frontend-patterns` `frontend-a11y` `vite-patterns` `nextjs-turbopack` | `react-reviewer` `react-build-resolver` | `react-review` `react-build` `react-test` |
| **Vue / Nuxt** | `vue-patterns` `nuxt4-patterns` | `vue-reviewer` | `vue-review` |
| **Go** | `golang-patterns` `golang-testing` | `go-reviewer` `go-build-resolver` | `go-build` `go-review` `go-test` |
| **Rust** | `rust-patterns` `rust-testing` | `rust-reviewer` `rust-build-resolver` | `rust-build` `rust-review` `rust-test` |
| **C++** | `cpp-coding-standards` `cpp-testing` | `cpp-reviewer` `cpp-build-resolver` | `cpp-build` `cpp-review` `cpp-test` |
| **C#/.NET** | `csharp-testing` `dotnet-patterns` | `csharp-reviewer` | — |
| **Kotlin / Android** | `kotlin-patterns` `kotlin-coroutines-flows` `kotlin-testing` `android-clean-architecture` | `kotlin-reviewer` `kotlin-build-resolver` | `kotlin-build` `kotlin-review` `kotlin-test` |
| **Swift / iOS** | `swiftui-patterns` `swift-concurrency-6-2` `foundation-models-on-device` | `swift-reviewer` `swift-build-resolver` | — |
| **PHP / Laravel** | `laravel-patterns` `laravel-tdd` `laravel-security` | `php-reviewer` | — |
| **Django** | `django-patterns` `django-tdd` `django-celery` `django-security` | `django-reviewer` `django-build-resolver` | — |
| **Flutter / Dart** | `dart-flutter-patterns` `flutter-dart-code-review` | `flutter-reviewer` `dart-build-resolver` | `flutter-build` `flutter-review` `flutter-test` |
| **Angular** | `angular-developer` | — | — |
| **Quarkus** | `quarkus-patterns` `quarkus-tdd` | — | — |
| **Perl** | `perl-patterns` `perl-testing` `perl-security` | — | — |
| **Ruby** | （仅 rules） | — | — |
| **ArkTS / HarmonyOS** | （仅 rules） | `harmonyos-app-resolver` | — |

### 2.5 数据与基础设施

**skills**
- 数据库：`skill:database-migrations` `skill:mysql-patterns` `skill:postgres-patterns` `skill:redis-patterns` `skill:clickhouse-io` `skill:prisma-patterns`
- 部署运维：`skill:docker-patterns` `skill:deployment-patterns` `skill:kubernetes-patterns` `skill:uncloud` `skill:bun-runtime`

**agents**
- `agent:database-reviewer` `agent:performance-optimizer` `agent:data-throughput-accelerator`

**commands**
- `command:pm2` `command:project-init`

### 2.6 Agent 系统 / 多代理编排 / 循环

**agents**
- `agent:loop-operator` `agent:harness-optimizer` `agent:spec-miner` `agent:agent-evaluator`
- GAN 流水线：`agent:gan-planner` `agent:gan-generator` `agent:gan-evaluator`

**skills**
- `skill:agent-architecture-audit` `skill:agent-harness-construction` `skill:agent-introspection-debugging`
- `skill:autonomous-agent-harness` `skill:autonomous-loops` `skill:continuous-agent-loop`
- `skill:gan-style-harness` `skill:claude-devfleet` `skill:team-agent-orchestration` `skill:parallel-execution-optimizer` `skill:iterative-retrieval`

**commands**
- `command:orch-add-feature` `command:orch-build-mvp` `command:orch-change-feature` `command:orch-fix-defect` `command:orch-refine-code` `command:orch-review`
- `command:multi-plan` `command:multi-execute` `command:multi-backend` `command:multi-frontend` `command:multi-workflow`
- `command:loop-start` `command:loop-status`
- `command:gan-build` `command:gan-design`

### 2.7 安全 / 合规 / 测试

**agents**
- `agent:security-reviewer` `agent:silent-failure-hunter` `agent:healthcare-reviewer` `agent:mle-reviewer`

**skills**
- 通用：`skill:security-review` `skill:security-scan` `skill:safety-guard` `skill:error-handling` `skill:api-design` `skill:api-connector-builder`
- 医疗：`skill:healthcare-cdss-patterns` `skill:healthcare-emr-patterns` `skill:healthcare-eval-harness` `skill:healthcare-phi-compliance` `skill:hipaa-compliance`
- 测试：`skill:e2e-testing` `skill:tdd-workflow` `skill:eval-harness` `skill:verification-loop`

**commands**
- `command:test-coverage` `command:security-scan` `command:quality-gate`

### 2.8 插件生态自身的元工具 ⭐

> 用户画像"插件维护者"的核心工具集合。这些是清理、配置、审计、自省这个仓库本身用的。

**agents**
- `agent:opensource-forker` `agent:opensource-sanitizer` `agent:opensource-packager`
- `agent:doc-updater` `agent:harness-optimizer` `agent:agent-evaluator`

**skills**
- 配置：`skill:ck` `skill:configure-ecc` `skill:context-budget` `skill:config-gc` `skill:workspace-surface-audit`
- 审计：`skill:github-ops` `skill:repo-scan` `skill:skill-stocktake` `skill:skill-scout` `skill:skill-comply` `skill:rules-distill` `skill:security-scan`
- 知识：`skill:knowledge-ops` `skill:continuous-learning-v2` `skill:growth-log`

**commands**
- 元生态：`command:skill-create` `command:skill-health` `command:instinct-status` `command:instinct-export` `command:instinct-import` `command:promote` `command:prune`
- 会话管理：`command:save-session` `command:resume-session` `command:sessions` `command:project-init` `command:projects`
- 自我评估：`command:learn` `command:learn-eval` `command:evolve`
- ECC 导航：`command:ecc-guide` `command:harness-audit` `command:cost-report`
- Hook 规则：`command:hookify` `command:hookify-configure` `command:hookify-list` `command:hookify-help`

### 2.9 文档 / 学习 / 知识沉淀

**skills**
- `skill:architecture-decision-records` `skill:codebase-onboarding` `skill:code-tour`
- `skill:continuous-learning-v2` `skill:growth-log` `skill:knowledge-ops`

**commands**
- `command:update-codemaps` `command:update-docs`
- `command:save-session` `command:resume-session` `command:learn` `command:learn-eval`
- `command:claude-md-improver`（用户级）

### 2.10 网络 / DevOps / 基础设施

**agents**
- `agent:network-architect` `agent:network-troubleshooter` `agent:network-config-reviewer`
- `agent:homelab-architect` `agent:harmonyos-app-resolver`

**skills**
- `skill:cisco-ios-patterns` `skill:network-bgp-diagnostics` `skill:network-config-validation` `skill:network-interface-health`
- `skill:homelab-network-readiness` `skill:homelab-network-setup` `skill:homelab-vlan-segmentation` `skill:homelab-pihole-dns` `skill:homelab-wireguard-vpn`
- `skill:docker-patterns` `skill:kubernetes-patterns` `skill:deployment-patterns` `skill:bun-runtime` `skill:uncloud`

### 2.11 搜索 / 研究 / 数据采集

**skills**
- `skill:exa-search` `skill:deep-research` `skill:research-ops` `skill:documentation-lookup`
- `skill:data-scraper-agent` `skill:data-throughput-accelerator` `skill:iterative-retrieval`

### 2.12 产品 / 营销 / 增长（与"工程师"画像相关性弱）

**skills**
- 市场：`skill:market-research` `skill:competitive-platform-analysis` `skill:competitive-report-structure` `skill:benchmark-methodology`
- 营销：`skill:marketing-campaign` `skill:content-engine` `skill:crosspost` `skill:social-publisher` `skill:connections-optimizer` `skill:lead-intelligence`
- 品牌：`skill:brand-discovery` `skill:brand-voice` `skill:taste` `skill:article-writing`
- 决策：`skill:council` `skill:ito-basket-compare`

**agents**
- `agent:marketing-agent` `agent:seo-specialist`

### 2.13 前端 UI / 设计 / 动画 / 媒体

**skills**
- UI 框架：`skill:react-patterns` `skill:vue-patterns` `skill:angular-developer` `skill:nuxt4-patterns`
- 设计系统：`skill:design-system` `skill:accessibility` `skill:frontend-a11y` `skill:frontend-design-direction`
- 动画：`skill:motion-foundations` `skill:motion-patterns` `skill:motion-advanced` `skill:motion-ui`
- 数据可视化：`skill:dataviz`（用户级）
- 媒体生成：`skill:fal-ai-media` `skill:liquid-glass-design` `skill:ios-icon-gen`
- 演示：`skill:frontend-slides` `skill:ui-demo` `skill:ui-to-vue` `skill:make-interfaces-feel-better`
- 视频：`skill:remotion-video-creation` `skill:manim-video` `skill:video-editing` `skill:videodb` `skill:blender-motion-state-inspection`

### 2.14 通信 / 通知 / 运维

**skills**
- `skill:email-ops` `skill:unified-notifications-ops` `skill:messages-ops` `skill:mailtrap-email-integration`
- `skill:customer-billing-ops` `skill:customs-trade-compliance` `skill:finance-billing-ops`
- `skill:delivery-gate` `skill:pm2`（部署管理）

### 2.15 行业专用

**skills**
- 医疗：`skill:healthcare-cdss-patterns` `skill:healthcare-emr-patterns` `skill:healthcare-eval-harness` `skill:healthcare-phi-compliance` `skill:hipaa-compliance`
- 预测市场：`skill:ito-basket-compare` `skill:ito-data-atlas-agent` `skill:ito-market-intelligence` `skill:ito-trade-planner` `skill:prediction-market-oracle-research` `skill:prediction-market-risk-review`
- 物流 / 供应链：`skill:carrier-relationship-management` `skill:logistics-exception-management` `skill:returns-reverse-logistics` `skill:inventory-demand-planning`
- 制造：`skill:production-scheduling` `skill:quality-nonconformance`
- 能源：`skill:energy-procurement`

### 2.16 AI / Agent 工程方法论

**skills**
- `skill:agentic-engineering` `skill:agentic-os` `skill:ai-first-engineering` `skill:ai-regression-testing`
- `skill:cost-aware-llm-pipeline` `skill:mle-workflow`
- `skill:eval-harness` `skill:loop-design-check` `skill:council` `skill:context-budget`

### 2.17 Misc / 较窄主题

- 加密 / Web3：`skill:evm-token-decimals` `skill:nodejs-keccak256` `skill:defi-amm-security` `skill:agent-payment-x402`
- 科学数据库：`skill:scientific-db-pubmed-database` `skill:scientific-db-uspto-database` `skill:scientific-pkg-gget` `skill:scientific-thinking-literature-review` `skill:scientific-thinking-scholar-evaluation`
- 个人：`skill:visa-doc-translate`
- 投资：`skill:investor-materials` `skill:investor-outreach`
- 杂项：`skill:remotion-video-creation` `skill:tinystruct-patterns` `skill:foundation-models-on-device` `skill:network-bgp-diagnostics` `skill:netmiko-ssh-automation` `skill:nutrient-document-processing`

---

## 三、按用户使用场景分类

### 🎯 A. 高频日常工作流（用户主动调用）

| 场景 | 推荐组件 |
|------|---------|
| 新功能开发 | `command:orch-add-feature` `command:prp-plan` `command:prp-implement` `agent:planner` `skill:blueprint` |
| 修复 Bug | `command:orch-fix-defect` `command:orch-change-feature` `command:review-pr` |
| 重构 | `command:orch-refine-code` `command:refactor-clean` `agent:refactor-cleaner` `command:simplify` |
| 写代码前规划 | `command:plan` `command:plan-prd` `command:pwf` `command:plan-canvas` `command:learn-eval` |
| PR / Commit | `command:pr` `command:prp-pr` `command:prp-commit` `skill:git-workflow` |
| 代码审查 | `command:code-review` `agent:code-reviewer` `command:review-pr` |
| 文档查询 | `command:documentation-lookup` `skill:exa-search` |
| 健康检查 | `command:harness-audit` `command:skill-health` |

### 🎯 B. 知识管理与学习沉淀

| 场景 | 推荐组件 |
|------|---------|
| 写 CLAUDE.md | `command:claude-md-improver` `command:revise-claude-md`（用户级） |
| 提取学习模式 | `command:learn` `command:learn-eval` `skill:continuous-learning-v2` `skill:growth-log` |
| 沉淀 instinct | `command:instinct-export` `command:instinct-import` `command:promote` `command:prune` |
| 知识库管理 | `skill:knowledge-ops` |
| 决策记录 | `skill:architecture-decision-records` |
| 复盘会话 | `command:save-session` `command:resume-session` `command:sessions` |

### 🎯 C. 插件生态维护（用户核心画像）

| 场景 | 推荐组件 |
|------|---------|
| 安装 / 配置 ECC | `skill:configure-ecc` `command:project-init` |
| 创建 / 优化 skill | `command:skill-create` `skill:skill-creator` `command:skill-health` |
| 审计 skill 质量 | `skill:skill-stocktake` `skill:skill-comply` |
| 上下文预算 | `skill:context-budget` `skill:config-gc` |
| 安全扫描 | `command:security-scan` `skill:security-scan` |
| 工作区评估 | `skill:workspace-surface-audit` `skill:repo-scan` |
| 依赖图（**当前技能**） | `skill:dependency-graph` |
| 规则提炼 | `skill:rules-distill` |
| 钩子规则管理 | `command:hookify` `command:hookify-list` `command:hookify-configure` `command:hookify-help` |
| 开源发布 | `skill:opensource-pipeline` |
| GitHub 运维 | `skill:github-ops` |
| 组件保留/排除决策 | `decision-ledger.js`（属于 `skill:dependency-graph`，见 [DECISIONS.md](DECISIONS.md)） |
| 上游同步 | `skill:upstream-sync` |

### 🎯 D. 跨语言开发支持

| 场景 | 推荐组件 |
|------|---------|
| Java 后端核心 | `skill:springboot-patterns` `skill:springboot-tdd` `skill:springboot-security` `skill:springboot-verification` `skill:jpa-patterns` `skill:java-coding-standards` `skill:database-migrations` `skill:mysql-patterns` `skill:redis-patterns` `skill:error-handling` |
| Python 脚本 | `skill:python-patterns` `skill:python-testing` |
| TypeScript / JS | `skill:bun-runtime` |
| Web 前端（偶尔） | `skill:react-patterns` `skill:react-testing` `skill:frontend-patterns` `skill:frontend-a11y` `skill:vite-patterns` `skill:accessibility` |

### 🎯 E. 多代理 / AI 工程方法论

| 场景 | 推荐组件 |
|------|---------|
| 编排工作流 | `command:orch-*` `command:multi-*` `command:gan-build` `command:gan-design` |
| Agent 调优 | `skill:agent-harness-construction` `skill:agent-architecture-audit` `skill:iterative-retrieval` |
| 自主循环 | `command:loop-start` `command:loop-status` `agent:loop-operator` `skill:autonomous-loops` `skill:continuous-agent-loop` |
| 评估体系 | `skill:eval-harness` `command:test-coverage` |
| 决策辅助 | `skill:council` |

### 🎯 F. 数据 / 性能 / 部署

| 场景 | 推荐组件 |
|------|---------|
| 数据库变更 | `skill:database-migrations` `skill:mysql-patterns` `agent:database-reviewer` |
| 性能优化 | `agent:performance-optimizer` `skill:benchmark` `skill:benchmark-optimization-loop` |
| 容器化部署 | `skill:docker-patterns` `skill:kubernetes-patterns` `skill:deployment-patterns` `command:pm2` |
| 监控仪表板 | `skill:dashboard-builder` |

### 🎯 G. 用户日常辅助

| 场景 | 推荐组件 |
|------|---------|
| 复杂问题解答 | `command:aside`（主对话不中断） |
| 引用工作区上下文 | `command:apollo-customization-sync`（用户级） |
| 文件归档 | `command:save-analysis` `command:save-plan` `command:save-api-doc` `command:save-note`（用户级） |
| 插件菜单可见性 | `command:plugin-overlay`（用户级） |
| 市场元数据同步 | `command:market-sync`（用户级） |
| 子市场搜索 | `command:find-skills` |

---

## 四、rules/ 子目录结构（122 个）

### `rules/common/` — 跨语言通用规则（13 个）
`rule:common/agents.md` `rule:common/code-review.md` `rule:common/coding-style.md` `rule:common/development-workflow.md` `rule:common/git-workflow.md` `rule:common/hooks.md` `rule:common/patterns.md` `rule:common/performance.md` `rule:common/security.md` `rule:common/testing.md`（+ README）

### `rules/<language>/` — 各语言专属（按语言组织的五件套）

> 每种语言都包含 `coding-style.md` `hooks.md` `patterns.md` `security.md` `testing.md`（部分缺）。

| 语言子目录 | 完整度 |
|------------|--------|
| java, python, typescript, vue, react-native, cpp, csharp, dart, fsharp, perl, php, react, ruby, rust, arkts, angular, golang | 大部分有 5 件套 |

### `rules/web/` — Web 前端专项（6 个）
`rule:web/coding-style.md` `rule:web/design-quality.md` `rule:web/hooks.md` `rule:web/patterns.md` `rule:web/performance.md` `rule:web/security.md` `rule:web/testing.md`

### 项目级 `.claude/rules/`（2 个）
- `rule:.claude/everything-claude-code-guardrails.md` — 提示防御基线
- `rule:.claude/node.md` — Node.js 项目规则

---

## 五、关键观察

1. **数量爆炸点**：skill(278) 远超 agent(70) 和 command(89)，是主要的"知识库"载体。
2. **多语言覆盖广**：rules 支持 17 种语言、agents 有 13 种语言专属 review agent、skills 中有 30+ 种语言/框架专属。
3. **插件生态元工具成体系**：`skill:configure-ecc` `skill:context-budget` `skill:config-gc` `skill:skill-stocktake` `skill:ck` `skill:workspace-surface-audit` `skill:repo-scan` `skill:github-ops` 形成完整的"维护自身"工具链。
4. **冗余候选**：存在 skill 已被更新版替代的情况（如 `skill:continuous-learning` v1 被 v2 替代）。
5. **哪些组件该保留/排除不在本文档回答**：这类判断依赖用户画像、会随时间调整，属于决策而不是分类，记录在 [`decisions.json`](data/decisions.json)（见 [DECISIONS.md](DECISIONS.md)），不维护在这份静态文档里。

---

## 六、与 dependency-graph 的关系

> 本文档**不替代** `dependency-graph` 工具，而是它的**语义补充**。

| 维度 | dependency-graph 工具 | 本文档 |
|------|----------------------|--------|
| **关系数据** | ✅ 引用边（references_skill / references_agent 等） | ❌ |
| **权威分类（按 install module）** | ✅ 覆盖 277/278 skill | 部分（基于 install-modules.json 扩展） |
| **agent 分类** | ❌（只有引用图） | ✅ |
| **command 分类** | ❌（只有引用图） | ✅ |
| **rule 分类** | 部分（按目录结构） | ✅ |
| **组件保留/排除决策** | ✅（`decision-ledger.js`，见 [DECISIONS.md](DECISIONS.md)） | ❌（本文档不做这个判断） |
| **查询接口** | CLI（`relationship-query.js`） | 纯文档浏览 |

### 推荐组合用法

1. **想清理/禁用某类组件**：先用本文档定位分类，再用 `decision-ledger.js record <id> exclude` 记录决策、`prune` 执行裁剪——不要直接改本文档，本文档不驱动任何执行。
2. **想重命名/删除某个组件**：先 `relationship-query.js dependents <id>` 看引用方，确认影响面后再操作。
3. **想知道某分类下装了哪些 skill**：本文档提供入口清单；权威 module 标签见 `manifests/install-modules.json`。
4. **想看完整的引用图**：跑 `relationship-render.js --write` 生成 `DEPENDENCY-GRAPH.md`。
5. **想看 skill 的 module 归属**：用 `relationship-query.js uses module:<module-id>`。

### 相关脚本示例

```bash
# 看 jpa-patterns 被谁引用（典型 Spring Boot 核心 skill）
node .claude/skills/dependency-graph/scripts/relationship-query.js dependents skill:jpa-patterns

# 看 java-coding-standards 自己引用了哪些 skill
node .claude/skills/dependency-graph/scripts/relationship-query.js uses skill:java-coding-standards

# 列出 framework-language module 下所有 skill
node .claude/skills/dependency-graph/scripts/relationship-query.js uses module:framework-language

# 找出所有孤儿引用（目标已删除但被引用）
node .claude/skills/dependency-graph/scripts/relationship-query.js orphans
```

---

**维护说明**：本文件由 2026-07-10 的全量扫描生成，2026-07-11 已对照 registry 数据核对并修正过数量偏差，只覆盖功能/场景分类，不含任何保留/排除判断。如果仓库组件大幅变化（如新 install module、批量新增 skill），请重新生成。生成方式见 [README.md](README.md)。
