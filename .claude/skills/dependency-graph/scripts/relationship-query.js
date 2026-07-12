#!/usr/bin/env node
/**
 * 统一依赖图(见 relationship-graph.js)的查询 CLI。
 *
 * 用法:
 *   node relationship-query.js dependents <id> [--json]
 *   node relationship-query.js uses <id> [--json]
 *   node relationship-query.js orphans [--json]
 *   node relationship-query.js graph --from <id> [--depth <n>] [--json]
 *
 * 节点 id 长这样:rule:java/coding-style.md、agent:planner、
 * skill:jpa-patterns、command:plan、hook:pre:bash:dispatcher。
 */

'use strict';

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

const { buildGraph, findDependents, findUses, findOrphans } = require('./relationship-graph');

// mermaid 的节点 id 不能带冒号、斜杠这些字符(我们自己的节点 id 里全是这些),
// 所以画图时另外生成一个"安全 id"当节点标识,真正的节点 id 放进方括号标签里
// 显示给人看,两者互不影响。
function mermaidId(id) {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

// 从 startId 出发,沿正向边和反向边各走 depth 步(逐层 BFS),把途中经过的
// 节点和边都收集起来,用于 `graph --from` 子命令画一张局部关系图。
// 之所以同时走正向和反向,是因为"从这个节点出发能看到什么"和"谁指向了这个
// 节点"往往都想一起看到,单独一个方向经常看不出上下文。
function collectSubgraph(graph, startId, depth) {
  const visitedNodes = new Set([startId]);
  const collectedEdges = [];
  let frontier = [startId];

  for (let hop = 0; hop < depth; hop += 1) {
    const nextFrontier = [];
    for (const nodeId of frontier) {
      for (const edge of graph.edges) {
        if (edge.from === nodeId) {
          collectedEdges.push(edge);
          if (!visitedNodes.has(edge.to)) {
            visitedNodes.add(edge.to);
            nextFrontier.push(edge.to);
          }
        }
        if (edge.to === nodeId) {
          collectedEdges.push(edge);
          if (!visitedNodes.has(edge.from)) {
            visitedNodes.add(edge.from);
            nextFrontier.push(edge.from);
          }
        }
      }
    }
    frontier = nextFrontier;
  }

  // BFS 过程中同一条边可能从两个方向各被收集一次,这里去重。
  const seen = new Set();
  const uniqueEdges = collectedEdges.filter(edge => {
    const key = `${edge.from}|${edge.to}|${edge.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodeIds: visitedNodes, edges: uniqueEdges };
}

function renderMermaid(subgraph) {
  const lines = ['graph TD'];
  for (const edge of subgraph.edges) {
    lines.push(`  ${mermaidId(edge.from)}["${edge.from}"] -->|${edge.type}| ${mermaidId(edge.to)}["${edge.to}"]`);
  }
  return lines.join('\n');
}

function formatEdgeList(entries, key) {
  if (!entries.length) return '(无)\n';
  return `${entries.map(entry => `${entry[key]}  [${entry.type}]`).join('\n')}\n`;
}

function formatOrphans(entries) {
  if (!entries.length) return '(未发现孤儿引用)\n';
  return `${entries.map(entry => `${entry.from} -> ${entry.to}  [${entry.type}]`).join('\n')}\n`;
}

function findPositionalArg(args) {
  return args.find(arg => !arg.startsWith('--'));
}

function findFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx === -1 ? null : args[idx + 1];
}

function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const root = options.root || REPO_ROOT;

  try {
    const [subcommand, ...rest] = argv;
    const json = rest.includes('--json');
    const graph = buildGraph(root, options);

    switch (subcommand) {
      case 'dependents': {
        const id = findPositionalArg(rest);
        if (!id) throw new Error('用法:dependents <id> [--json]');
        const result = findDependents(graph, id);
        stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : formatEdgeList(result, 'from'));
        return 0;
      }

      case 'uses': {
        const id = findPositionalArg(rest);
        if (!id) throw new Error('用法:uses <id> [--json]');
        const result = findUses(graph, id);
        stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : formatEdgeList(result, 'to'));
        return 0;
      }

      case 'orphans': {
        const result = findOrphans(graph);
        stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : formatOrphans(result));
        return 0;
      }

      case 'graph': {
        const fromId = findFlagValue(rest, '--from');
        if (!fromId) throw new Error('用法:graph --from <id> [--depth <n>] [--json]');
        const depthRaw = findFlagValue(rest, '--depth');
        const depth = depthRaw ? parseInt(depthRaw, 10) : 2;
        if (!Number.isInteger(depth) || depth < 1 || depth > 10) {
          throw new Error('--depth 必须是 1 到 10 之间的整数');
        }
        const subgraph = collectSubgraph(graph, fromId, depth);
        if (json) {
          stdout.write(`${JSON.stringify({ nodes: Array.from(subgraph.nodeIds), edges: subgraph.edges }, null, 2)}\n`);
        } else {
          stdout.write(`\`\`\`mermaid\n${renderMermaid(subgraph)}\n\`\`\`\n`);
        }
        return 0;
      }

      default:
        throw new Error(`未知子命令:${subcommand || '(空)'}。可用:dependents|uses|orphans|graph。`);
    }
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  collectSubgraph,
  formatEdgeList,
  formatOrphans,
  mermaidId,
  renderMermaid,
  run,
};
