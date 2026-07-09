#!/usr/bin/env node
/**
 * 把 rule/skill/agent/hook 四个 registry(本目录下的 4 个 generator 产出)
 * 加上 scripts/ci/generate-command-registry.js 的 command registry(只读
 * require,从不修改)、以及仓库里 manifests/install-modules.json(只读,给
 * 其他 harness 用的选择性安装清单)合并成一张统一的依赖图。
 *
 * 节点 id 规则:rule:<路径>、agent:<名字>、skill:<名字>、command:<名字>、
 * hook:<id>、module:<install-modules.json 里的 module id>、
 * script:<路径>(script 节点只在文件真实存在时才创建——如果一个
 * hook 指向的脚本不存在,这条边的终点就没有对应节点,会被下面的孤儿检测
 * 自动抓出来,跟其他类型的"死链接"走的是同一套机制,不用单独写一套判断)。
 *
 * 用法:
 *   node relationship-graph.js            # 打印节点/边数量,不落盘
 *   node relationship-graph.js --write    # 落盘到 data/graph.json
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SKILL_DIR, '..', '..', '..');
const DEFAULT_OUTPUT_PATH = path.join(SKILL_DIR, 'data', 'graph.json');
const DEFAULT_OVERRIDES_PATH = path.join(SKILL_DIR, 'overrides.json');

const { assertWithinSkillDir, parseArgs } = require('./lib/registry-cli');
const { normalizePath } = require('./lib/reference-helpers');

const ruleRegistryModule = require('./generate-rule-registry');
const skillRegistryModule = require('./generate-skill-registry');
const agentRegistryModule = require('./generate-agent-registry');
const hookRegistryModule = require('./generate-hook-registry');
// 永远从真实仓库根目录加载(只读复用它导出的函数),跟下面 buildGraph 的
// root 参数(将来扫描的目标目录,自测时会换成临时 fixture 目录)是两件事——
// root 只决定"扫描哪棵目录树",不影响"从哪里加载这段解析逻辑本身"。
const commandRegistryModule = require(path.join(REPO_ROOT, 'scripts', 'ci', 'generate-command-registry'));
// 读取人工维护的 overrides.json:suppress 用来抑制已确认的误报边,manual
// 用来补充静态正则扫不出来的引用。文件不存在时静默返回空,不报错——这个
// 文件本来就是可选的。
function loadOverrides(overridesPath) {
  if (!fs.existsSync(overridesPath)) {
    return { suppress: [], manual: [] };
  }

  let raw;
  try {
    raw = fs.readFileSync(overridesPath, 'utf8');
  } catch (error) {
    throw new Error(`读取 overrides 文件 ${overridesPath} 失败:${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`解析 ${overridesPath} 失败,请检查 JSON 语法:${error.message}`);
  }

  return {
    suppress: parsed.suppress || [],
    manual: parsed.manual || [],
  };
}

// 读取 manifests/install-modules.json:这是仓库给"没有原生插件机制的其他 harness"
// (cursor/codebuddy/qwen 等)用的选择性安装清单,按主题把 skill 分成了 module。
// 只读复用,从不修改;文件不存在时静默返回空数组,不报错,跟 loadOverrides 一个
// 套路。只有 module.paths 里 "skills/<name>" 这种逐条列名字的条目才有意义——
// rules/agents/commands/hooks 在这份清单里都是整目录/固定文件引用,没有逐项
// 粒度,不产出节点/边。
function loadInstallModules(installModulesPath) {
  if (!fs.existsSync(installModulesPath)) {
    return [];
  }

  let raw;
  try {
    raw = fs.readFileSync(installModulesPath, 'utf8');
  } catch (error) {
    throw new Error(`读取 install modules 文件 ${installModulesPath} 失败:${error.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`解析 ${installModulesPath} 失败,请检查 JSON 语法:${error.message}`);
  }

  return parsed.modules || [];
}

function addNode(nodes, id, type, name, nodePath, meta) {
  nodes.set(id, { type, name, path: nodePath, meta: meta || {} });
}

function buildGraph(root = REPO_ROOT, options = {}) {
  const overridesPath = options.overridesPath || DEFAULT_OVERRIDES_PATH;
  const installModulesPath = options.installModulesPath || path.join(root, 'manifests', 'install-modules.json');

  const ruleRegistry = ruleRegistryModule.generateRegistry({ root });
  const skillRegistry = skillRegistryModule.generateRegistry({ root });
  const agentRegistry = agentRegistryModule.generateRegistry({ root });
  const hookRegistry = hookRegistryModule.generateRegistry({ root });
  const commandRegistry = commandRegistryModule.generateRegistry({ root });

  const nodes = new Map();
  const edges = [];

  // 每一类节点分两步处理:第一步先把该类型的全部节点都建好(比如全部 rule
  // 节点),第二步再统一建边——这样不管边指向谁,节点集合都已经是完整的了,
  // 不用担心"先处理到某条边、目标节点还没建好"的顺序问题。
  for (const rule of ruleRegistry.rules) {
    addNode(nodes, `rule:${rule.rule}`, 'rule', rule.rule, rule.path, { paths: rule.paths });
  }
  for (const rule of ruleRegistry.rules) {
    const id = `rule:${rule.rule}`;
    if (rule.extends) {
      edges.push({ from: id, to: `rule:${rule.extends}`, type: 'extends' });
    }
    for (const agent of rule.agents) {
      edges.push({ from: id, to: `agent:${agent}`, type: 'references_agent' });
    }
    for (const skill of rule.skills) {
      edges.push({ from: id, to: `skill:${skill}`, type: 'references_skill' });
    }
  }

  for (const skill of skillRegistry.skills) {
    addNode(nodes, `skill:${skill.skill}`, 'skill', skill.skill, skill.path, { description: skill.description });
  }
  for (const skill of skillRegistry.skills) {
    const id = `skill:${skill.skill}`;
    for (const agent of skill.agents) {
      edges.push({ from: id, to: `agent:${agent}`, type: 'references_agent' });
    }
    for (const other of skill.skills) {
      edges.push({ from: id, to: `skill:${other}`, type: 'references_skill' });
    }
  }

  for (const agent of agentRegistry.agents) {
    addNode(nodes, `agent:${agent.agent}`, 'agent', agent.agent, agent.path, { model: agent.model, tools: agent.tools });
  }
  for (const agent of agentRegistry.agents) {
    const id = `agent:${agent.agent}`;
    for (const other of agent.agents) {
      edges.push({ from: id, to: `agent:${other}`, type: 'references_agent' });
    }
    for (const skill of agent.skills) {
      edges.push({ from: id, to: `skill:${skill}`, type: 'references_skill' });
    }
  }

  for (const command of commandRegistry.commands) {
    addNode(nodes, `command:${command.command}`, 'command', command.command, command.path, {
      description: command.description,
      commandType: command.type,
    });
  }
  for (const command of commandRegistry.commands) {
    const id = `command:${command.command}`;
    for (const agent of command.allAgents) {
      edges.push({ from: id, to: `agent:${agent}`, type: 'references_agent' });
    }
    for (const skill of command.skills) {
      edges.push({ from: id, to: `skill:${skill}`, type: 'references_skill' });
    }
  }

  for (const hook of hookRegistry.hooks) {
    if (!hook.id) {
      // 没有 id 的条目(通常是文档性质的参考配置)没法作为稳定的 hook 节点,
      // 但里面引用的脚本如果已经不存在,不应该被静默忽略。用配置文件路径作为
      // 来源 id 生成一条"悬空"边,这样 findOrphans 仍然能把它报出来。
      for (const script of hook.scripts) {
        if (!script.exists) {
          edges.push({
            from: `hook-config:${hook.sourceFile}`,
            to: `script:${script.path}`,
            type: 'hook_script',
          });
        }
      }
      continue;
    }

    const id = `hook:${hook.id}`;
    addNode(nodes, id, 'hook', hook.id, hook.sourceFile, {
      event: hook.event,
      matcher: hook.matcher,
      description: hook.description,
    });
    for (const script of hook.scripts) {
      const scriptId = `script:${script.path}`;
      // 只有脚本真实存在才建 script 节点;不存在的话就让这条边"悬空",
      // 交给 findOrphans 统一识别为孤儿。
      if (script.exists && !nodes.has(scriptId)) {
        addNode(nodes, scriptId, 'script', script.path, script.path, {});
      }
      edges.push({ from: id, to: scriptId, type: 'hook_script' });
    }
  }

  const installModules = loadInstallModules(installModulesPath);
  const installModulesRelPath = normalizePath(path.relative(root, installModulesPath));
  for (const module of installModules) {
    addNode(nodes, `module:${module.id}`, 'module', module.id, installModulesRelPath, {
      kind: module.kind || null,
      description: module.description || null,
    });
  }
  for (const module of installModules) {
    const id = `module:${module.id}`;
    for (const modulePath of module.paths || []) {
      // module.paths 里绝大多数是整目录引用(比如 "rules"、"agents"),只有
      // "skills/<name>" 这种指向单个 skill 子目录的条目才值得建边——这是
      // install-modules.json 里唯一逐项列出具体组件名字的粒度,见文件头注释。
      if (modulePath.startsWith('skills/') && modulePath !== 'skills') {
        const skillName = modulePath.slice('skills/'.length);
        edges.push({ from: id, to: `skill:${skillName}`, type: 'installs_skill' });
      }
    }
  }

  const overrides = loadOverrides(overridesPath);
  const suppressed = new Set(
    overrides.suppress.map(entry => `${entry.from}|${entry.to}|${entry.type}`)
  );
  const filteredEdges = edges.filter(edge => !suppressed.has(`${edge.from}|${edge.to}|${edge.type}`));
  for (const manual of overrides.manual) {
    filteredEdges.push({ from: manual.from, to: manual.to, type: manual.type || 'manual', note: manual.note });
  }

  return { nodes, edges: filteredEdges };
}

// 谁依赖 id(反向边):id 被哪些节点引用了。删除/重命名前该查这个。
function findDependents(graph, id) {
  return graph.edges
    .filter(edge => edge.to === id)
    .map(edge => ({ from: edge.from, type: edge.type }));
}

// id 依赖谁(正向边):id 自己引用/用到了哪些东西。
function findUses(graph, id) {
  return graph.edges
    .filter(edge => edge.from === id)
    .map(edge => ({ to: edge.to, type: edge.type }));
}

// 孤儿引用:边的终点在节点集合里找不到,说明引用的目标已经不存在了。
function findOrphans(graph) {
  return graph.edges
    .filter(edge => !graph.nodes.has(edge.to))
    .map(edge => ({ from: edge.from, to: edge.to, type: edge.type }));
}

// Map 不能直接 JSON.stringify,落盘前转成普通数组。
function toSerializable(graph) {
  return {
    schemaVersion: 1,
    nodes: Array.from(graph.nodes.entries()).map(([id, node]) => ({ id, ...node })),
    edges: graph.edges,
  };
}

function formatGraph(graph) {
  return `${JSON.stringify(toSerializable(graph), null, 2)}\n`;
}

function writeGraph(graph, outputPath = DEFAULT_OUTPUT_PATH) {
  assertWithinSkillDir(outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, formatGraph(graph), 'utf8');
}

function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const outputPath = options.outputPath || DEFAULT_OUTPUT_PATH;

  try {
    const args = parseArgs(argv, ['--json', '--write', '--check']);
    const graph = buildGraph(options.root || REPO_ROOT, options);

    if (args.check) {
      let current;
      try {
        current = fs.readFileSync(outputPath, 'utf8');
      } catch (error) {
        throw new Error(`读取 ${outputPath} 失败:${error.message}`);
      }
      if (current !== formatGraph(graph)) {
        throw new Error(`${outputPath} 已过期,请重新运行 --write`);
      }
      stdout.write('依赖图已是最新。\n');
      return 0;
    }

    if (args.write) {
      writeGraph(graph, outputPath);
      stdout.write(`依赖图已写入 ${outputPath}\n`);
      return 0;
    }

    if (args.json) {
      stdout.write(formatGraph(graph));
      return 0;
    }

    stdout.write(`节点数:${graph.nodes.size}\n边数:${graph.edges.length}\n孤儿引用数:${findOrphans(graph).length}\n`);
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
  buildGraph,
  findDependents,
  findOrphans,
  findUses,
  formatGraph,
  run,
  toSerializable,
  writeGraph,
};
