#!/usr/bin/env node
/**
 * 把统一依赖图(见 relationship-graph.js)渲染成人可读的 DEPENDENCY-GRAPH.md。
 * 完全自包含在 .claude/skills/dependency-graph/ 目录下,不写仓库其他任何位置。
 *
 * 用法:
 *   node relationship-render.js          # 打印到 stdout,不落盘
 *   node relationship-render.js --write  # 写入 DEPENDENCY-GRAPH.md
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SKILL_DIR, '..', '..', '..');
const DEFAULT_OUTPUT_PATH = path.join(SKILL_DIR, 'DEPENDENCY-GRAPH.md');

const { assertWithinSkillDir, parseArgs } = require('./lib/registry-cli');
const { buildGraph, findOrphans } = require('./relationship-graph');
const { collectSubgraph, renderMermaid } = require('./relationship-query');

// 排名前几的枢纽节点才画局部关系图(depth 1),不是全部 15 个都画——原因见
// renderHubDiagrams 上面的说明。
const HUB_DIAGRAM_LIMIT = 5;

// 统计每个节点被多少条边指向(入度),用于"被引用最多"排行榜。
function computeInDegree(graph) {
  const counts = new Map();
  for (const edge of graph.edges) {
    counts.set(edge.to, (counts.get(edge.to) || 0) + 1);
  }
  return counts;
}

function topByType(graph, type, limit) {
  const counts = computeInDegree(graph);
  return Array.from(graph.nodes.entries())
    .filter(([, node]) => node.type === type)
    .map(([id]) => ({ id, count: counts.get(id) || 0 }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id))
    .slice(0, limit);
}

// extends 边在这个仓库里有 100+ 条(每个 common/*.md 平均被 15~20 个语言目录继承)。
// 早期版本把它们全部塞进一张 mermaid 图,结果密不可读——这不是"mermaid 渲不渲染"
// 的问题(GitHub 网页原生支持渲染 mermaid),是"100+ 条边挤在一张图里,不管用什么
// 工具画,人眼都看不出结构"的问题。改成按继承目标(即每个 common/*.md)分组的
// 小节 + 项目符号列表,天然按"被继承次数"排序,一眼看出核心规则文件是哪几个。
function renderExtendsSummary(graph) {
  const extendsEdges = graph.edges.filter(edge => edge.type === 'extends');
  if (!extendsEdges.length) return '_未检测到 extends 关系。_';

  const dependentsByTarget = new Map();
  for (const edge of extendsEdges) {
    if (!dependentsByTarget.has(edge.to)) {
      dependentsByTarget.set(edge.to, []);
    }
    dependentsByTarget.get(edge.to).push(edge.from);
  }

  const sortedTargets = Array.from(dependentsByTarget.entries())
    .sort(([leftId, leftDeps], [rightId, rightDeps]) => (
      rightDeps.length - leftDeps.length || leftId.localeCompare(rightId)
    ));

  const lines = [];
  for (const [target, dependents] of sortedTargets) {
    lines.push(`- \`${target}\`(被 ${dependents.length} 个文件继承)`);
    for (const dependent of dependents.sort()) {
      lines.push(`  - \`${dependent}\``);
    }
  }
  return lines.join('\n');
}

function renderTopTable(entries, label) {
  if (!entries.length) return `_(没有更多被引用的 ${label})_`;
  const lines = [`| ${label} | 被依赖次数 |`, '|---|---|'];
  for (const entry of entries) {
    lines.push(`| \`${entry.id}\` | ${entry.count} |`);
  }
  return lines.join('\n');
}

// 给排名前几的枢纽节点各画一张 depth=1 的局部关系图,而不是给全仓库 651 个节点、
// 758 条边画一张图——后者不管怎么画都是一团理不清的线(见 renderExtendsSummary
// 上面的说明),局部子图通常只有几条到十几条边,才是真正看得懂、能在 GitHub 上
// 直接渲染出来的"关系图"。复用 relationship-query.js 里已经写好并测过的
// collectSubgraph/renderMermaid,不重新实现一遍。
function renderHubDiagrams(graph, entries) {
  if (!entries.length) return '_没有可展示的关系图。_';
  return entries.map(entry => {
    const subgraph = collectSubgraph(graph, entry.id, 1);
    return `**\`${entry.id}\`**(被依赖 ${entry.count} 次)\n\n\`\`\`mermaid\n${renderMermaid(subgraph)}\n\`\`\`\n`;
  }).join('\n');
}

function renderOrphans(orphans) {
  if (!orphans.length) return '_未检测到孤儿引用。_';
  const lines = ['| 引用来源(from) | 引用目标(to,已不存在) | 引用类型 |', '|---|---|---|'];
  for (const orphan of orphans) {
    lines.push(`| \`${orphan.from}\` | \`${orphan.to}\` | ${orphan.type} |`);
  }
  return lines.join('\n');
}

function countByType(graph) {
  const counts = {};
  for (const node of graph.nodes.values()) {
    counts[node.type] = (counts[node.type] || 0) + 1;
  }
  return counts;
}

// skill 的分类数据来自 manifests/install-modules.json(见 relationship-graph.js
// 的 loadInstallModules),通过 installs_skill 边接进图里。这是仓库里唯一给
// skill 做过主题分组的地方,但它是"给其他 harness 用的选择性安装清单",不是
// 专门为分类而维护的,所以覆盖率不是 100%——没被任何 module 收录的 skill 会
// 计入"未归类",不是漏统计,是这份数据本身就没提到它们。
function renderSkillModules(graph) {
  const moduleNodes = Array.from(graph.nodes.entries()).filter(([, node]) => node.type === 'module');
  if (!moduleNodes.length) {
    return '_未检测到 module 节点(仓库里没有 manifests/install-modules.json)。_';
  }

  const skillCountByModule = new Map();
  const categorizedSkills = new Set();
  for (const edge of graph.edges) {
    if (edge.type !== 'installs_skill') continue;
    skillCountByModule.set(edge.from, (skillCountByModule.get(edge.from) || 0) + 1);
    categorizedSkills.add(edge.to);
  }

  const totalSkills = Array.from(graph.nodes.values()).filter(node => node.type === 'skill').length;
  const uncategorizedCount = totalSkills - categorizedSkills.size;

  const rows = moduleNodes
    .map(([id, node]) => ({ id, description: node.meta.description || '', count: skillCountByModule.get(id) || 0 }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.id.localeCompare(right.id));

  const lines = ['| module | 技能数 | 说明 |', '|---|---|---|'];
  for (const row of rows) {
    lines.push(`| \`${row.id}\` | ${row.count} | ${row.description} |`);
  }
  lines.push(`| _(未归类)_ | ${uncategorizedCount} | 存在于 \`skills/\`,但没被任何 install module 收录 |`);
  return lines.join('\n');
}

// command 的分类字段(commandType)是 generate-command-registry.js 里的
// inferCommandType() 早就算好、已经在图节点 meta 里的数据,这里只是分组展示,
// 不需要新的数据源。
function renderCommandCategories(graph) {
  const commandNodes = Array.from(graph.nodes.entries()).filter(([, node]) => node.type === 'command');
  if (!commandNodes.length) return '_未检测到 command 节点。_';

  const byType = new Map();
  for (const [id, node] of commandNodes) {
    const type = node.meta.commandType || 'general';
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(id);
  }

  return Array.from(byType.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, ids]) => `- **${type}**(${ids.length} 个):${ids.sort().map(id => `\`${id}\``).join('、')}`)
    .join('\n');
}

// hook 的分类字段(event,如 PreToolUse/PostToolUse/Stop)同样是已有数据,
// 只是分组展示。
function renderHookCategories(graph) {
  const hookNodes = Array.from(graph.nodes.entries()).filter(([, node]) => node.type === 'hook');
  if (!hookNodes.length) return '_未检测到 hook 节点。_';

  const byEvent = new Map();
  for (const [id, node] of hookNodes) {
    const event = node.meta.event || '(未知)';
    if (!byEvent.has(event)) byEvent.set(event, []);
    byEvent.get(event).push(id);
  }

  return Array.from(byEvent.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([event, ids]) => `- **${event}**(${ids.length} 个):${ids.sort().map(id => `\`${id}\``).join('、')}`)
    .join('\n');
}

// rule 没有专门的分类字段,但路径第一段目录天然就是语言/主题分组(比如
// "java/coding-style.md" 的 "java"),不需要额外数据源,纯粹从 rule.name 解析。
// 只给数量,不重复展开文件列表——那份明细已经在"extends 继承关系"里能看到。
function renderRuleCategories(graph) {
  const ruleNodes = Array.from(graph.nodes.values()).filter(node => node.type === 'rule');
  if (!ruleNodes.length) return '_未检测到 rule 节点。_';

  const byDir = new Map();
  for (const node of ruleNodes) {
    const slashIndex = node.name.indexOf('/');
    const dir = slashIndex === -1 ? '(根目录)' : node.name.slice(0, slashIndex);
    byDir.set(dir, (byDir.get(dir) || 0) + 1);
  }

  const lines = ['| 目录(语言/主题) | rule 文件数 |', '|---|---|'];
  const sorted = Array.from(byDir.entries()).sort(([leftDir, leftCount], [rightDir, rightCount]) => (
    rightCount - leftCount || leftDir.localeCompare(rightDir)
  ));
  for (const [dir, count] of sorted) {
    lines.push(`| \`${dir}\` | ${count} |`);
  }
  return lines.join('\n');
}

function renderMarkdown(graph) {
  const counts = countByType(graph);
  const orphans = findOrphans(graph);
  const topSkills = topByType(graph, 'skill', 15);
  const topAgents = topByType(graph, 'agent', 15);

  return `# ECC 依赖关系图(自动生成,请勿手改)

> 本文档由 \`node .claude/skills/dependency-graph/scripts/relationship-render.js --write\`(或 \`npm run render\`)自动生成。
> 数据来源:本 skill 目录下的 4 个 generator(rule/skill/agent/hook registry)
> + 只读复用 \`scripts/ci/generate-command-registry.js\` 已导出的 \`extractReferences\`/\`extractDescription\`/\`generateRegistry\`(该文件本身未被修改)
> + 只读复用 \`manifests/install-modules.json\`(给其他 harness 用的选择性安装清单,用来给 skill 打分类标签)。
> 删除/清理任何组件前,先用下面的反向查询确认没人依赖它:
> \`node .claude/skills/dependency-graph/scripts/relationship-query.js dependents <id>\`

## 节点统计

| 类型 | 数量 | 说明 |
|---|---|---|
| rule | ${counts.rule || 0} | rules/**/*.md |
| skill | ${counts.skill || 0} | skills/*/SKILL.md |
| agent | ${counts.agent || 0} | agents/*.md |
| command | ${counts.command || 0} | commands/*.md |
| hook | ${counts.hook || 0} | hooks/hooks.json + hooks/*/hooks.json |
| script | ${counts.script || 0} | 被某个 hook 引用、且文件确实存在的脚本 |
| module | ${counts.module || 0} | manifests/install-modules.json 里的安装模块 |
| **边总数** | **${graph.edges.length}** | 上述节点之间的全部引用关系 |

## 按类别浏览

### skill

数据来源:\`manifests/install-modules.json\`。这是给其他 harness(cursor/codebuddy/qwen 等)用的选择性安装清单,不是专门维护的分类表,所以覆盖率不是 100%——"未归类"那一行不是漏统计,是这份清单本身没提到那些 skill。

${renderSkillModules(graph)}

想看某个 module 具体装了哪些 skill:\`node .claude/skills/dependency-graph/scripts/relationship-query.js uses module:<id>\`。

### command

按 \`generate-command-registry.js\` 推断的类型分组:

${renderCommandCategories(graph)}

### hook

按触发事件(event)分组:

${renderHookCategories(graph)}

### rule

按 \`rules/\` 下的一级目录(即语言/主题)分组,只给数量——具体文件已经在下面"extends 继承关系"里能看到:

${renderRuleCategories(graph)}

### agent

暂无分类数据源——仓库里没有任何地方给这 ${counts.agent || 0} 个 agent 做过主题分组。想了解某个 agent 的关系,直接查它的依赖:\`node .claude/skills/dependency-graph/scripts/relationship-query.js dependents/uses <id>\`。

## rules/ 的 extends 继承关系

按继承目标(即被继承的 common/*.md,或 rules/common/development-workflow.md 这种横向继承)分组,
括号内是被继承的次数,子项是继承它的文件:

${renderExtendsSummary(graph)}

## 被引用最多的 skill

被依赖次数最高的 ${HUB_DIAGRAM_LIMIT} 个 skill,各自的局部关系图(depth 1,能看出具体是谁在依赖它):

${renderHubDiagrams(graph, topSkills.slice(0, HUB_DIAGRAM_LIMIT))}

第 ${HUB_DIAGRAM_LIMIT + 1}~15 名:

${renderTopTable(topSkills.slice(HUB_DIAGRAM_LIMIT), 'skill')}

## 被引用最多的 agent

被依赖次数最高的 ${HUB_DIAGRAM_LIMIT} 个 agent,各自的局部关系图(depth 1,能看出具体是谁在依赖它):

${renderHubDiagrams(graph, topAgents.slice(0, HUB_DIAGRAM_LIMIT))}

第 ${HUB_DIAGRAM_LIMIT + 1}~15 名:

${renderTopTable(topAgents.slice(HUB_DIAGRAM_LIMIT), 'agent')}

## 孤儿引用(引用目标已不存在)

> 注意:并非每一条都是需要修的"死链接"。有些是引用了仓库外部的 skill(比如某个 OKX 官方 skill 包)
> 或用户个人 \`.claude/skills/\` 下的 skill,又或者是像"reviewer-class agent"这种描述性短语被误判成了具体引用。
> 确认是误报后,可以写进 \`overrides.json\` 的 \`suppress\` 列表让它以后不再出现。

${renderOrphans(orphans)}

## 如何使用

- 删除/清理某个组件前,先查它有谁依赖:
  \`node .claude/skills/dependency-graph/scripts/relationship-query.js dependents <id>\`
- 查某个组件自己引用/使用了什么:
  \`node .claude/skills/dependency-graph/scripts/relationship-query.js uses <id>\`
- 查某个节点周边的局部关系图(输出 mermaid,适合小范围查看,几十条边以内可读):
  \`node .claude/skills/dependency-graph/scripts/relationship-query.js graph --from <id> --depth 2\`
- 节点 id 格式:\`rule:<rules/下的相对路径>\`、\`agent:<name>\`、\`skill:<name>\`、\`command:<name>\`、\`hook:<id>\`。
- 也可以在 .claude/skills/dependency-graph/ 目录下用 \`npm run <script>\` 执行,见该目录下的 package.json。
`;
}

function writeMarkdown(markdown, outputPath = DEFAULT_OUTPUT_PATH) {
  assertWithinSkillDir(outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown, 'utf8');
}

function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;

  try {
    const args = parseArgs(argv, ['--write', '--check']);
    const graph = buildGraph(options.root || REPO_ROOT, options);
    const markdown = renderMarkdown(graph);

    if (args.check) {
      let current;
      try {
        current = fs.readFileSync(outputPath, 'utf8');
      } catch (error) {
        throw new Error(`读取 ${outputPath} 失败:${error.message}`);
      }
      if (current !== markdown) {
        throw new Error(`${outputPath} 已过期,请重新运行 --write`);
      }
      stdout.write('依赖关系文档已是最新。\n');
      return 0;
    }

    if (args.write) {
      writeMarkdown(markdown, outputPath);
      stdout.write(`依赖关系文档已写入 ${outputPath}\n`);
      return 0;
    }

    stdout.write(markdown);
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  renderMarkdown,
  run,
  writeMarkdown,
};
