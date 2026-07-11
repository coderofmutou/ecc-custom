# ECC 依赖关系图(自动生成,请勿手改)

> 本文档由 `node .claude/skills/dependency-graph/scripts/relationship-render.js --write`(或 `npm run render`)自动生成。
> 数据来源:本 skill 目录下的 4 个 generator(rule/skill/agent/hook registry)
> + 只读复用 `scripts/ci/generate-command-registry.js` 已导出的 `extractReferences`/`extractDescription`/`generateRegistry`(该文件本身未被修改)
> + 只读复用 `manifests/install-modules.json`(给其他 harness 用的选择性安装清单,用来给 skill 打分类标签)。
> 删除/清理任何组件前,先用下面的反向查询确认没人依赖它:
> `node .claude/skills/dependency-graph/scripts/relationship-query.js dependents <id>`

## 节点统计

| 类型 | 数量 | 说明 |
|---|---|---|
| rule | 122 | rules/**/*.md |
| skill | 278 | skills/*/SKILL.md |
| agent | 67 | agents/*.md |
| command | 94 | commands/*.md |
| hook | 30 | hooks/hooks.json + hooks/*/hooks.json |
| script | 28 | 被某个 hook 引用、且文件确实存在的脚本 |
| module | 32 | manifests/install-modules.json 里的安装模块 |
| **边总数** | **758** | 上述节点之间的全部引用关系 |

## 按类别浏览

### skill

数据来源:`manifests/install-modules.json`。这是给其他 harness(cursor/codebuddy/qwen 等)用的选择性安装清单,不是专门维护的分类表,所以覆盖率不是 100%——"未归类"那一行不是漏统计,是这份清单本身没提到那些 skill。

| module | 技能数 | 说明 |
|---|---|---|
| `module:framework-language` | 68 | Core framework, language, and application-engineering skills. |
| `module:workflow-quality` | 43 | Evaluation, TDD, verification, compaction, and learning skills, including the legacy continuous-learning v1 path. |
| `module:agentic-patterns` | 35 | Agentic engineering, autonomous loops, agent harness construction, and LLM pipeline optimization skills. |
| `module:operator-workflows` | 19 | Connected-app operator workflows for setup audits, billing operations, program tracking, Google Workspace, and network optimization. |
| `module:security` | 19 | Security review and security-focused framework guidance. |
| `module:devops-infra` | 16 | Deployment workflows, Docker patterns, and infrastructure skills. |
| `module:business-content` | 14 | Business, writing, market, and investor communication skills. |
| `module:research-apis` | 9 | Research and API integration skills for deep investigations and model integrations. |
| `module:media-generation` | 8 | Media generation, technical explainers, and AI-assisted editing skills. |
| `module:optimization-workflows` | 8 | Parallel execution, benchmarking, data-throughput, latency, and recursive decision-ledger skills for faster evidence-backed work. |
| `module:supply-chain-domain` | 8 | Supply chain, logistics, procurement, and manufacturing domain skills. |
| `module:database` | 7 | Database and persistence-focused skills. |
| `module:swift-apple` | 7 | Swift, SwiftUI, and Apple platform skills including concurrency, persistence, and design patterns. |
| `module:prediction-market-skills` | 6 | Public, non-advisory prediction-market and Itô basket research workflows with gated Itô API access. |
| `module:machine-learning` | 4 | Production machine-learning engineering workflows for data contracts, reproducible training, evaluation, deployment, monitoring, and rollback. |
| `module:social-distribution` | 3 | Social publishing and distribution skills. |
| `module:document-processing` | 2 | Document processing, conversion, and translation skills. |
| `module:orchestration` | 1 | Worktree/tmux orchestration runtime and workflow docs. |
| _(未归类)_ | 1 | 存在于 `skills/`,但没被任何 install module 收录 |

想看某个 module 具体装了哪些 skill:`node .claude/skills/dependency-graph/scripts/relationship-query.js uses module:<id>`。

### command

按 `generate-command-registry.js` 推断的类型分组:

- **build**(2 个):`command:gradle-build`、`command:setup-pm`
- **general**(10 个):`command:epic-publish`、`command:epic-sync`、`command:epic-unblock`、`command:hookify`、`command:hookify-configure`、`command:hookify-list`、`command:loop-status`、`command:pm2`、`command:projects`、`command:sessions`
- **orchestration**(11 个):`command:gan-build`、`command:multi-backend`、`command:multi-execute`、`command:multi-frontend`、`command:multi-plan`、`command:multi-workflow`、`command:orch-add-feature`、`command:orch-build-mvp`、`command:orch-change-feature`、`command:orch-fix-defect`、`command:orch-refine-code`
- **planning**(2 个):`command:gan-design`、`command:update-codemaps`
- **refactoring**(1 个):`command:build-fix`
- **review**(15 个):`command:ecc-guide`、`command:epic-claim`、`command:epic-decompose`、`command:epic-review`、`command:epic-validate`、`command:instinct-status`、`command:learn`、`command:model-route`、`command:orch-review`、`command:plan-canvas`、`command:promote`、`command:prune`、`command:santa-loop`、`command:security-scan`、`command:skill-health`
- **testing**(53 个):`command:aside`、`command:auto-update`、`command:checkpoint`、`command:code-review`、`command:cost-report`、`command:cpp-build`、`command:cpp-review`、`command:cpp-test`、`command:evolve`、`command:fastapi-review`、`command:feature-dev`、`command:flutter-build`、`command:flutter-review`、`command:flutter-test`、`command:go-build`、`command:go-review`、`command:go-test`、`command:harness-audit`、`command:hookify-help`、`command:instinct-export`、`command:instinct-import`、`command:jira`、`command:kotlin-build`、`command:kotlin-review`、`command:kotlin-test`、`command:learn-eval`、`command:loop-start`、`command:marketing-campaign`、`command:plan`、`command:plan-prd`、`command:pr`、`command:project-init`、`command:prp-commit`、`command:prp-implement`、`command:prp-plan`、`command:prp-pr`、`command:prp-prd`、`command:python-review`、`command:quality-gate`、`command:react-build`、`command:react-review`、`command:react-test`、`command:refactor-clean`、`command:resume-session`、`command:review-pr`、`command:rust-build`、`command:rust-review`、`command:rust-test`、`command:save-session`、`command:skill-create`、`command:test-coverage`、`command:update-docs`、`command:vue-review`

### hook

按触发事件(event)分组:

- **PostToolUse**(10 个):`hook:post:bash:dispatcher`、`hook:post:ecc-context-monitor`、`hook:post:ecc-metrics-bridge`、`hook:post:edit:accumulator`、`hook:post:edit:console-warn`、`hook:post:edit:design-quality-check`、`hook:post:governance-capture`、`hook:post:observe:continuous-learning`、`hook:post:quality-gate`、`hook:post:session-activity-tracker`
- **PostToolUseFailure**(1 个):`hook:post:mcp-health-check`
- **PreCompact**(1 个):`hook:pre:compact`
- **PreToolUse**(8 个):`hook:pre:bash:dispatcher`、`hook:pre:config-protection`、`hook:pre:edit-write:gateguard-fact-force`、`hook:pre:edit-write:suggest-compact`、`hook:pre:governance-capture`、`hook:pre:mcp-health-check`、`hook:pre:observe:continuous-learning`、`hook:pre:write:doc-file-warning`
- **SessionEnd**(2 个):`hook:session:end`、`hook:session:end:marker`
- **SessionStart**(2 个):`hook:session-start:plan-canvas-sessions`、`hook:session:start`
- **Stop**(6 个):`hook:stop:check-console-log`、`hook:stop:cost-tracker`、`hook:stop:desktop-notify`、`hook:stop:evaluate-session`、`hook:stop:format-typecheck`、`hook:stop:session-end`

### rule

按 `rules/` 下的一级目录(即语言/主题)分组,只给数量——具体文件已经在下面"extends 继承关系"里能看到:

| 目录(语言/主题) | rule 文件数 |
|---|---|
| `common` | 10 |
| `react-native` | 8 |
| `web` | 7 |
| `python` | 6 |
| `angular` | 5 |
| `arkts` | 5 |
| `cpp` | 5 |
| `csharp` | 5 |
| `dart` | 5 |
| `fsharp` | 5 |
| `golang` | 5 |
| `java` | 5 |
| `kotlin` | 5 |
| `nuxt` | 5 |
| `perl` | 5 |
| `php` | 5 |
| `react` | 5 |
| `ruby` | 5 |
| `rust` | 5 |
| `swift` | 5 |
| `typescript` | 5 |
| `vue` | 5 |
| `(根目录)` | 1 |

### agent

暂无分类数据源——仓库里没有任何地方给这 67 个 agent 做过主题分组。想了解某个 agent 的关系,直接查它的依赖:`node .claude/skills/dependency-graph/scripts/relationship-query.js dependents/uses <id>`。

## rules/ 的 extends 继承关系

按继承目标(即被继承的 common/*.md,或 rules/common/development-workflow.md 这种横向继承)分组,
括号内是被继承的次数,子项是继承它的文件:

- `rule:common/patterns.md`(被 21 个文件继承)
  - `rule:angular/patterns.md`
  - `rule:arkts/patterns.md`
  - `rule:cpp/patterns.md`
  - `rule:csharp/patterns.md`
  - `rule:dart/patterns.md`
  - `rule:fsharp/patterns.md`
  - `rule:golang/patterns.md`
  - `rule:java/patterns.md`
  - `rule:kotlin/patterns.md`
  - `rule:nuxt/patterns.md`
  - `rule:perl/patterns.md`
  - `rule:php/patterns.md`
  - `rule:python/patterns.md`
  - `rule:react-native/patterns.md`
  - `rule:ruby/patterns.md`
  - `rule:rust/patterns.md`
  - `rule:swift/patterns.md`
  - `rule:typescript/patterns.md`
  - `rule:vue/patterns.md`
  - `rule:web/design-quality.md`
  - `rule:web/patterns.md`
- `rule:common/coding-style.md`(被 20 个文件继承)
  - `rule:angular/coding-style.md`
  - `rule:arkts/coding-style.md`
  - `rule:cpp/coding-style.md`
  - `rule:csharp/coding-style.md`
  - `rule:dart/coding-style.md`
  - `rule:fsharp/coding-style.md`
  - `rule:golang/coding-style.md`
  - `rule:java/coding-style.md`
  - `rule:kotlin/coding-style.md`
  - `rule:nuxt/coding-style.md`
  - `rule:perl/coding-style.md`
  - `rule:php/coding-style.md`
  - `rule:python/coding-style.md`
  - `rule:react-native/coding-style.md`
  - `rule:ruby/coding-style.md`
  - `rule:rust/coding-style.md`
  - `rule:swift/coding-style.md`
  - `rule:typescript/coding-style.md`
  - `rule:vue/coding-style.md`
  - `rule:web/coding-style.md`
- `rule:common/hooks.md`(被 20 个文件继承)
  - `rule:angular/hooks.md`
  - `rule:arkts/hooks.md`
  - `rule:cpp/hooks.md`
  - `rule:csharp/hooks.md`
  - `rule:dart/hooks.md`
  - `rule:fsharp/hooks.md`
  - `rule:golang/hooks.md`
  - `rule:java/hooks.md`
  - `rule:kotlin/hooks.md`
  - `rule:nuxt/hooks.md`
  - `rule:perl/hooks.md`
  - `rule:php/hooks.md`
  - `rule:python/hooks.md`
  - `rule:react-native/hooks.md`
  - `rule:ruby/hooks.md`
  - `rule:rust/hooks.md`
  - `rule:swift/hooks.md`
  - `rule:typescript/hooks.md`
  - `rule:vue/hooks.md`
  - `rule:web/hooks.md`
- `rule:common/security.md`(被 20 个文件继承)
  - `rule:angular/security.md`
  - `rule:arkts/security.md`
  - `rule:cpp/security.md`
  - `rule:csharp/security.md`
  - `rule:dart/security.md`
  - `rule:fsharp/security.md`
  - `rule:golang/security.md`
  - `rule:java/security.md`
  - `rule:kotlin/security.md`
  - `rule:nuxt/security.md`
  - `rule:perl/security.md`
  - `rule:php/security.md`
  - `rule:python/security.md`
  - `rule:react-native/security.md`
  - `rule:ruby/security.md`
  - `rule:rust/security.md`
  - `rule:swift/security.md`
  - `rule:typescript/security.md`
  - `rule:vue/security.md`
  - `rule:web/security.md`
- `rule:common/testing.md`(被 20 个文件继承)
  - `rule:angular/testing.md`
  - `rule:arkts/testing.md`
  - `rule:cpp/testing.md`
  - `rule:csharp/testing.md`
  - `rule:dart/testing.md`
  - `rule:fsharp/testing.md`
  - `rule:golang/testing.md`
  - `rule:java/testing.md`
  - `rule:kotlin/testing.md`
  - `rule:nuxt/testing.md`
  - `rule:perl/testing.md`
  - `rule:php/testing.md`
  - `rule:python/testing.md`
  - `rule:react-native/testing.md`
  - `rule:ruby/testing.md`
  - `rule:rust/testing.md`
  - `rule:swift/testing.md`
  - `rule:typescript/testing.md`
  - `rule:vue/testing.md`
  - `rule:web/testing.md`
- `rule:common/performance.md`(被 2 个文件继承)
  - `rule:react-native/performance.md`
  - `rule:web/performance.md`
- `rule:common/git-workflow.md`(被 1 个文件继承)
  - `rule:common/development-workflow.md`
- `rule:typescript/coding-style.md`(被 1 个文件继承)
  - `rule:react/coding-style.md`
- `rule:typescript/patterns.md`(被 1 个文件继承)
  - `rule:react/patterns.md`
- `rule:typescript/security.md`(被 1 个文件继承)
  - `rule:react/security.md`
- `rule:typescript/testing.md`(被 1 个文件继承)
  - `rule:react/testing.md`

## 被引用最多的 skill

被依赖次数最高的 5 个 skill,各自的局部关系图(depth 1,能看出具体是谁在依赖它):

**`skill:accessibility`**(被依赖 12 次)

```mermaid
graph TD
  rule_react_patterns_md["rule:react/patterns.md"] -->|references_skill| skill_accessibility["skill:accessibility"]
  skill_flutter_dart_code_review["skill:flutter-dart-code-review"] -->|references_skill| skill_accessibility["skill:accessibility"]
  skill_intent_driven_development["skill:intent-driven-development"] -->|references_skill| skill_accessibility["skill:accessibility"]
  skill_motion_ui["skill:motion-ui"] -->|references_skill| skill_accessibility["skill:accessibility"]
  skill_react_patterns["skill:react-patterns"] -->|references_skill| skill_accessibility["skill:accessibility"]
  skill_react_performance["skill:react-performance"] -->|references_skill| skill_accessibility["skill:accessibility"]
  skill_react_testing["skill:react-testing"] -->|references_skill| skill_accessibility["skill:accessibility"]
  agent_react_reviewer["agent:react-reviewer"] -->|references_skill| skill_accessibility["skill:accessibility"]
  command_multi_plan["command:multi-plan"] -->|references_skill| skill_accessibility["skill:accessibility"]
  command_react_review["command:react-review"] -->|references_skill| skill_accessibility["skill:accessibility"]
  command_react_test["command:react-test"] -->|references_skill| skill_accessibility["skill:accessibility"]
  module_framework_language["module:framework-language"] -->|installs_skill| skill_accessibility["skill:accessibility"]
```

**`skill:security-review`**(被依赖 10 次)

```mermaid
graph TD
  rule_csharp_security_md["rule:csharp/security.md"] -->|references_skill| skill_security_review["skill:security-review"]
  rule_fsharp_security_md["rule:fsharp/security.md"] -->|references_skill| skill_security_review["skill:security-review"]
  rule_java_security_md["rule:java/security.md"] -->|references_skill| skill_security_review["skill:security-review"]
  rule_nuxt_security_md["rule:nuxt/security.md"] -->|references_skill| skill_security_review["skill:security-review"]
  rule_ruby_security_md["rule:ruby/security.md"] -->|references_skill| skill_security_review["skill:security-review"]
  rule_rust_security_md["rule:rust/security.md"] -->|references_skill| skill_security_review["skill:security-review"]
  skill_mysql_patterns["skill:mysql-patterns"] -->|references_skill| skill_security_review["skill:security-review"]
  skill_production_audit["skill:production-audit"] -->|references_skill| skill_security_review["skill:security-review"]
  agent_security_reviewer["agent:security-reviewer"] -->|references_skill| skill_security_review["skill:security-review"]
  module_security["module:security"] -->|installs_skill| skill_security_review["skill:security-review"]
```

**`skill:tdd-workflow`**(被依赖 10 次)

```mermaid
graph TD
  rule_php_testing_md["rule:php/testing.md"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  rule_ruby_testing_md["rule:ruby/testing.md"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  skill_production_audit["skill:production-audit"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  skill_react_testing["skill:react-testing"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  agent_tdd_guide["agent:tdd-guide"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  command_cpp_test["command:cpp-test"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  command_go_test["command:go-test"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  command_kotlin_test["command:kotlin-test"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  command_react_test["command:react-test"] -->|references_skill| skill_tdd_workflow["skill:tdd-workflow"]
  module_workflow_quality["module:workflow-quality"] -->|installs_skill| skill_tdd_workflow["skill:tdd-workflow"]
```

**`skill:rust-patterns`**(被依赖 9 次)

```mermaid
graph TD
  rule_rust_coding_style_md["rule:rust/coding-style.md"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  rule_rust_patterns_md["rule:rust/patterns.md"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  rule_rust_security_md["rule:rust/security.md"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  agent_rust_build_resolver["agent:rust-build-resolver"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  agent_rust_reviewer["agent:rust-reviewer"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  command_rust_build["command:rust-build"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  command_rust_review["command:rust-review"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  command_rust_test["command:rust-test"] -->|references_skill| skill_rust_patterns["skill:rust-patterns"]
  module_framework_language["module:framework-language"] -->|installs_skill| skill_rust_patterns["skill:rust-patterns"]
```

**`skill:cpp-coding-standards`**(被依赖 8 次)

```mermaid
graph TD
  rule_cpp_coding_style_md["rule:cpp/coding-style.md"] -->|references_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
  rule_cpp_patterns_md["rule:cpp/patterns.md"] -->|references_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
  rule_cpp_security_md["rule:cpp/security.md"] -->|references_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
  agent_cpp_build_resolver["agent:cpp-build-resolver"] -->|references_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
  agent_cpp_reviewer["agent:cpp-reviewer"] -->|references_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
  command_cpp_build["command:cpp-build"] -->|references_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
  command_cpp_review["command:cpp-review"] -->|references_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
  module_framework_language["module:framework-language"] -->|installs_skill| skill_cpp_coding_standards["skill:cpp-coding-standards"]
```


第 6~15 名:

| skill | 被依赖次数 |
|---|---|
| `skill:react-patterns` | 8 |
| `skill:backend-patterns` | 7 |
| `skill:continuous-learning-v2` | 7 |
| `skill:e2e-testing` | 7 |
| `skill:flutter-dart-code-review` | 7 |
| `skill:golang-patterns` | 7 |
| `skill:network-config-validation` | 7 |
| `skill:network-interface-health` | 7 |
| `skill:react-testing` | 7 |
| `skill:frontend-patterns` | 6 |

## 被引用最多的 agent

被依赖次数最高的 5 个 agent,各自的局部关系图(depth 1,能看出具体是谁在依赖它):

**`agent:planner`**(被依赖 7 次)

```mermaid
graph TD
  rule_common_agents_md["rule:common/agents.md"] -->|references_agent| agent_planner["agent:planner"]
  rule_common_development_workflow_md["rule:common/development-workflow.md"] -->|references_agent| agent_planner["agent:planner"]
  skill_architecture_decision_records["skill:architecture-decision-records"] -->|references_agent| agent_planner["agent:planner"]
  skill_gan_style_harness["skill:gan-style-harness"] -->|references_agent| agent_planner["agent:planner"]
  skill_search_first["skill:search-first"] -->|references_agent| agent_planner["agent:planner"]
  agent_gan_planner["agent:gan-planner"] -->|references_agent| agent_planner["agent:planner"]
  command_plan["command:plan"] -->|references_agent| agent_planner["agent:planner"]
```

**`agent:security-reviewer`**(被依赖 7 次)

```mermaid
graph TD
  rule_angular_security_md["rule:angular/security.md"] -->|references_agent| agent_security_reviewer["agent:security-reviewer"]
  rule_common_code_review_md["rule:common/code-review.md"] -->|references_agent| agent_security_reviewer["agent:security-reviewer"]
  rule_common_security_md["rule:common/security.md"] -->|references_agent| agent_security_reviewer["agent:security-reviewer"]
  rule_typescript_security_md["rule:typescript/security.md"] -->|references_agent| agent_security_reviewer["agent:security-reviewer"]
  skill_plankton_code_quality["skill:plankton-code-quality"] -->|references_agent| agent_security_reviewer["agent:security-reviewer"]
  skill_prompt_optimizer["skill:prompt-optimizer"] -->|references_agent| agent_security_reviewer["agent:security-reviewer"]
  agent_security_reviewer["agent:security-reviewer"] -->|references_skill| skill_security_review["skill:security-review"]
  command_security_scan["command:security-scan"] -->|references_agent| agent_security_reviewer["agent:security-reviewer"]
```

**`agent:architect`**(被依赖 3 次)

```mermaid
graph TD
  rule_common_agents_md["rule:common/agents.md"] -->|references_agent| agent_architect["agent:architect"]
  skill_search_first["skill:search-first"] -->|references_agent| agent_architect["agent:architect"]
  agent_code_architect["agent:code-architect"] -->|references_agent| agent_architect["agent:architect"]
```

**`agent:code-reviewer`**(被依赖 3 次)

```mermaid
graph TD
  rule_common_agents_md["rule:common/agents.md"] -->|references_agent| agent_code_reviewer["agent:code-reviewer"]
  rule_common_code_review_md["rule:common/code-review.md"] -->|references_agent| agent_code_reviewer["agent:code-reviewer"]
  rule_common_development_workflow_md["rule:common/development-workflow.md"] -->|references_agent| agent_code_reviewer["agent:code-reviewer"]
```

**`agent:database-reviewer`**(被依赖 3 次)

```mermaid
graph TD
  skill_mysql_patterns["skill:mysql-patterns"] -->|references_agent| agent_database_reviewer["agent:database-reviewer"]
  skill_postgres_patterns["skill:postgres-patterns"] -->|references_agent| agent_database_reviewer["agent:database-reviewer"]
  skill_redis_patterns["skill:redis-patterns"] -->|references_agent| agent_database_reviewer["agent:database-reviewer"]
```


第 6~15 名:

| agent | 被依赖次数 |
|---|---|
| `agent:network-troubleshooter` | 3 |
| `agent:react-reviewer` | 3 |
| `agent:tdd-guide` | 3 |
| `agent:typescript-reviewer` | 3 |
| `agent:dart-build-resolver` | 2 |
| `agent:flutter-reviewer` | 2 |
| `agent:go-reviewer` | 2 |
| `agent:network-config-reviewer` | 2 |
| `agent:python-reviewer` | 2 |
| `agent:rust-reviewer` | 2 |

## 孤儿引用(引用目标已不存在)

> 注意:并非每一条都是需要修的"死链接"。有些是引用了仓库外部的 skill(比如某个 OKX 官方 skill 包)
> 或用户个人 `.claude/skills/` 下的 skill,又或者是像"reviewer-class agent"这种描述性短语被误判成了具体引用。
> 确认是误报后,可以写进 `overrides.json` 的 `suppress` 列表让它以后不再出现。

| 引用来源(from) | 引用目标(to,已不存在) | 引用类型 |
|---|---|---|
| `skill:agent-payment-x402` | `skill:okx-agent-payments-protocol` | references_skill |
| `skill:agent-payment-x402` | `skill:okx-x402-payment` | references_skill |
| `skill:agent-sort` | `skill:skill-library` | references_skill |
| `skill:team-builder` | `agent:general-purpose` | references_agent |

## 如何使用

- 删除/清理某个组件前,先查它有谁依赖:
  `node .claude/skills/dependency-graph/scripts/relationship-query.js dependents <id>`
- 查某个组件自己引用/使用了什么:
  `node .claude/skills/dependency-graph/scripts/relationship-query.js uses <id>`
- 查某个节点周边的局部关系图(输出 mermaid,适合小范围查看,几十条边以内可读):
  `node .claude/skills/dependency-graph/scripts/relationship-query.js graph --from <id> --depth 2`
- 节点 id 格式:`rule:<rules/下的相对路径>`、`agent:<name>`、`skill:<name>`、`command:<name>`、`hook:<id>`。
- 也可以在 .claude/skills/dependency-graph/ 目录下用 `npm run <script>` 执行,见该目录下的 package.json。
