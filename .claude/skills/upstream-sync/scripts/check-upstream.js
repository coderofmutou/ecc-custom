#!/usr/bin/env node
/**
 * 只读地对比当前分支和 upstream/main 的差异,不修改任何东西。
 *
 * 用法:node check-upstream.js [--json]
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const DEPENDENCY_GRAPH_DIR = path.join(REPO_ROOT, '.claude', 'skills', 'dependency-graph');
const DEPENDENCY_GRAPH_SCRIPTS = path.join(DEPENDENCY_GRAPH_DIR, 'scripts');

const { buildGraph } = require(path.join(DEPENDENCY_GRAPH_SCRIPTS, 'relationship-graph'));
const { loadLedger, resolveComponentPath } = require(path.join(DEPENDENCY_GRAPH_SCRIPTS, 'decision-ledger'));

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失败:${(result.stderr || result.stdout || '').trim()}`);
  }
  return result.stdout.trim();
}

function listCommits(root, range) {
  const output = runGit(['log', '--oneline', range], root);
  return output ? output.split('\n') : [];
}

// 三个点(A...B)对比的是"相对公共祖先各自的变化",这才是"合并会带来哪些
// 文件改动"的正确问法;两个点对比的是两个端点直接的差异,语义不一样。
function listChangedFiles(root, range) {
  const output = runGit(['diff', '--name-only', range], root);
  return output ? output.split('\n').filter(Boolean) : [];
}

// 只有真正做过 exclude 决定(decision,不是 suggestedDecision)的组件才计入
// "已裁剪路径"——建议数据不构成任何实际状态。
function buildExcludedPathSet(ledger, graph) {
  const paths = new Set();
  for (const entry of ledger.entries) {
    if (entry.decision !== 'exclude') continue;
    const relPath = resolveComponentPath(graph, entry.id);
    if (relPath) paths.add(relPath);
  }
  return paths;
}

function isUnderExcludedPath(file, excludedPaths) {
  return [...excludedPaths].some(excluded => file === excluded || file.startsWith(`${excluded}/`));
}

function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const root = options.root || REPO_ROOT;
  const json = argv.includes('--json');

  try {
    runGit(['fetch', 'upstream'], root);

    const incoming = listCommits(root, 'main..upstream/main');
    const localOnly = listCommits(root, 'upstream/main..main');
    const changedFiles = listChangedFiles(root, 'main...upstream/main');

    const ledgerPath = options.ledgerPath || path.join(DEPENDENCY_GRAPH_DIR, 'data', 'decisions.json');
    const ledger = loadLedger(ledgerPath);
    const graph = buildGraph(root);
    const excludedPaths = buildExcludedPathSet(ledger, graph);

    const touchedExcluded = [];
    const touchedKept = [];
    for (const file of changedFiles) {
      (isUnderExcludedPath(file, excludedPaths) ? touchedExcluded : touchedKept).push(file);
    }

    const result = {
      incomingCommitCount: incoming.length,
      incomingCommits: incoming,
      localOnlyCommitCount: localOnly.length,
      localOnlyCommits: localOnly,
      touchedExcludedCount: touchedExcluded.length,
      touchedExcluded,
      touchedKeptCount: touchedKept.length,
      touchedKept,
    };

    if (json) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    stdout.write(`待同步提交(main..upstream/main):${incoming.length} 个\n`);
    if (incoming.length) {
      stdout.write(`${incoming.map(line => `  ${line}`).join('\n')}\n`);
    }
    stdout.write(`\n本地独有提交(upstream/main..main):${localOnly.length} 个\n`);
    if (localOnly.length) {
      stdout.write(`${localOnly.map(line => `  ${line}`).join('\n')}\n`);
    }
    stdout.write(`\n上游改动涉及的文件里,命中已裁剪路径的:${touchedExcluded.length} 个(合并后会被机械化重删,不用担心)\n`);
    stdout.write(`上游改动涉及保留文件的:${touchedKept.length} 个(值得同步前留意)\n`);
    if (touchedKept.length) {
      stdout.write(`${touchedKept.map(file => `  ${file}`).join('\n')}\n`);
    }
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
  run,
  listCommits,
  listChangedFiles,
  buildExcludedPathSet,
  isUnderExcludedPath,
};
