#!/usr/bin/env node
/**
 * 唯一会修改工作区的脚本,但只在新建的 sync/upstream-<date> 分支上操作,
 * 绝不直接改 main,绝不 push。用 merge 不用 rebase——fork 的 main 可能已经
 * 推到远端,rebase 要改写历史需要 force-push,踩到"force push 前必须确认"
 * 的红线;merge 不需要改写历史。
 *
 * 用法:node sync-upstream.js --date <YYYY-MM-DD> [--json]
 *
 * 流程:
 *   1. git fetch upstream
 *   2. 基于当前 main 创建 sync/upstream-<date> 分支并切换过去
 *   3. git merge upstream/main
 *   4. 冲突文件按路径分两类:命中 decisions.json 里已经 decision=exclude 的
 *      组件路径 → 不管冲突内容,直接 git rm -f 机械化解决(反正要删,不需要
 *      看上游改了什么);其余保留文件的真实冲突 → 原样留给人工/Claude 处理,
 *      不自动 add/commit。
 *   5. 如果所有冲突都被机械化解决了(没有遗留的人工冲突),自动完成合并提交,
 *      然后无条件重跑一次裁剪(覆盖"上游新增了本该属于已裁剪目录、但因为是
 *      全新文件不会触发合并冲突"的情况),补删的文件如果有实际变化会立刻
 *      git add -A && git commit(和机械化冲突删除一样是确定性操作,不留
 *      未提交的删除滞留在 sync 分支上)。如果还有人工冲突没解决,合并不会
 *      被提交,裁剪也不会在这次运行里执行——留给用户处理完冲突后自己决定
 *      什么时候重跑 decision-ledger.js prune --apply。
 *   6. 合并到 main 这一步永远交还给用户自己确认执行,本脚本不做,也绝不 push。
 */

'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const DEPENDENCY_GRAPH_DIR = path.join(REPO_ROOT, '.claude', 'skills', 'dependency-graph');
const DEPENDENCY_GRAPH_SCRIPTS = path.join(DEPENDENCY_GRAPH_DIR, 'scripts');
const LEDGER_PATH = path.join(DEPENDENCY_GRAPH_DIR, 'data', 'decisions.json');

const { buildGraph } = require(path.join(DEPENDENCY_GRAPH_SCRIPTS, 'relationship-graph'));
const {
  loadLedger,
  resolveComponentPath,
  buildPrunePlan,
  applyPrunePlan,
} = require(path.join(DEPENDENCY_GRAPH_SCRIPTS, 'decision-ledger'));

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error) {
    throw result.error;
  }
  return result;
}

// merge 冲突时 git 的退出码非 0 是正常预期结果,不是异常——调用方自己按场景
// 判断要不要当错误处理,所以这里不像 check-upstream.js 的 runGit 那样自动抛错。
function assertGitSucceeded(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} 失败:${(result.stderr || result.stdout || '').trim()}`);
  }
}

function findFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx === -1 ? null : args[idx + 1];
}

function listConflictedFiles(root) {
  const result = runGit(['diff', '--name-only', '--diff-filter=U'], root);
  assertGitSucceeded(result, 'git diff --diff-filter=U');
  return result.stdout.trim() ? result.stdout.trim().split('\n') : [];
}

function buildExcludedPathSet(ledger, graph) {
  const paths = new Set();
  for (const entry of ledger.entries) {
    if (entry.decision !== 'exclude') continue;
    const relPath = resolveComponentPath(graph, entry.id);
    if (relPath) paths.add(relPath);
  }
  return paths;
}

function classifyConflicts(conflicted, excludedPaths) {
  const mechanical = [];
  const manual = [];
  for (const file of conflicted) {
    const isExcluded = [...excludedPaths].some(excluded => file === excluded || file.startsWith(`${excluded}/`));
    (isExcluded ? mechanical : manual).push(file);
  }
  return { mechanical, manual };
}

function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const root = options.root || REPO_ROOT;
  const json = argv.includes('--json');
  const date = findFlagValue(argv, '--date');

  if (!date) {
    stderr.write('用法:sync-upstream.js --date <YYYY-MM-DD> [--json]\n');
    return 1;
  }

  const branchName = `sync/upstream-${date}`;

  try {
    assertGitSucceeded(runGit(['fetch', 'upstream'], root), 'git fetch upstream');

    const currentBranch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], root).stdout.trim();
    if (currentBranch !== 'main') {
      throw new Error(`当前分支是 ${currentBranch},不是 main——请先切回 main 再运行本脚本(本脚本只允许从 main 派生同步分支)`);
    }

    assertGitSucceeded(runGit(['checkout', '-b', branchName], root), `git checkout -b ${branchName}`);

    const mergeResult = runGit(['merge', 'upstream/main', '--no-edit'], root);
    const hasConflicts = mergeResult.status !== 0;

    let mechanical = [];
    let manual = [];
    let mergeFinalized = !hasConflicts;

    if (hasConflicts) {
      const ledger = loadLedger(LEDGER_PATH);
      const graph = buildGraph(root);
      const excludedPaths = buildExcludedPathSet(ledger, graph);

      const conflicted = listConflictedFiles(root);
      const classified = classifyConflicts(conflicted, excludedPaths);
      mechanical = classified.mechanical;
      manual = classified.manual;

      for (const file of mechanical) {
        assertGitSucceeded(runGit(['rm', '-f', file], root), `git rm -f ${file}`);
      }

      if (manual.length === 0) {
        assertGitSucceeded(runGit(['commit', '--no-edit'], root), 'git commit --no-edit(机械化冲突解决完毕后完成合并提交)');
        mergeFinalized = true;
      }
    }

    // 只有合并真正完成(没有遗留的人工冲突)才重新裁剪,避免在冲突未解决的
    // 中间状态里再叠加一批未提交的改动,让人工处理时状态更混乱。
    let rePrunePlan = [];
    let rePruneCommitted = false;
    if (mergeFinalized) {
      const ledgerAfterMerge = loadLedger(LEDGER_PATH);
      const graphAfterMerge = buildGraph(root);
      rePrunePlan = buildPrunePlan(ledgerAfterMerge, graphAfterMerge, root).filter(item => item.action === 'delete');
      applyPrunePlan(rePrunePlan, root);

      // 补删本身和"命中已裁剪路径的合并冲突"一样是机械化、确定性的操作,
      // 不提交的话这批删除会以未提交状态滞留在 sync 分支上——真去执行
      // SKILL.md 最后一步 git checkout main 时,可能被 git 挡下,或者更糟,
      // 作为游离的工作区改动被悄悄带过去,违背"新分支上操作、随时能重来"
      // 的安全前提。所以只要有实际删除,这里立刻提交,保持 sync 分支随时
      // 处于干净、可合并的状态。
      if (rePrunePlan.length > 0) {
        assertGitSucceeded(runGit(['add', '-A'], root), 'git add -A(提交重新裁剪产生的文件删除)');
        assertGitSucceeded(
          runGit(['commit', '-m', `chore: re-prune after upstream merge (${branchName})`], root),
          'git commit(重新裁剪)'
        );
        rePruneCommitted = true;
      }
    }

    const mergeToMainReminder = `合并完成、确认无误后由你自己决定是否 git checkout main && git merge ${branchName}(本脚本不会自动合并到 main,也绝不 push)`;
    const nextSteps = mergeFinalized
      ? [
        rePrunePlan.length
          ? `重新裁剪自动补删并提交了 ${rePrunePlan.length} 个文件/目录(上游新增的、本该属于已裁剪范围但不会触发合并冲突的内容)`
          : '重新裁剪没有发现需要补删的文件',
        '重跑 dependency-graph 的 registry 刷新(generate-*-registry.js --write + relationship-graph.js --write + relationship-render.js --write,最后一个用于重新生成 DEPENDENCY-GRAPH.md,否则这份人类可读报告会过期)',
        'node .claude/skills/dependency-graph/scripts/decision-ledger.js diff-upstream(确认没有新增组件遗漏分类、没有决策指向已经改名/消失的 id)',
        '确认 registry 刷新结果无误后,git add -A && git commit 提交(本脚本不会自动提交,因为要等这些脚本跑完才知道有没有变化)',
        mergeToMainReminder,
      ]
      : [
        `还有 ${manual.length} 个冲突文件需要人工/Claude 逐个处理:${manual.join(', ')}`,
        '处理完后 git add 对应文件,再 git commit 完成这次合并',
        '合并提交完成后,自己决定要不要重跑 node .claude/skills/dependency-graph/scripts/decision-ledger.js prune --apply(本次运行没有自动执行,因为合并还没完成)',
        '然后重跑 dependency-graph 的 registry 刷新(含 relationship-render.js --write,重新生成 DEPENDENCY-GRAPH.md)+ diff-upstream',
        mergeToMainReminder,
      ];

    const result = {
      branch: branchName,
      hasConflicts,
      mergeFinalized,
      mechanicallyResolvedConflicts: mechanical,
      manualConflicts: manual,
      rePrunePlan,
      rePruneCommitted,
      nextSteps,
    };

    if (json) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      stdout.write(`已在分支 ${branchName} 上完成合并尝试。\n`);
      stdout.write(`机械化删除解决的冲突:${mechanical.length} 个\n`);
      stdout.write(`需要人工处理的冲突:${manual.length} 个${manual.length ? `\n${manual.map(file => `  ${file}`).join('\n')}` : ''}\n`);
      stdout.write(`合并是否已完成提交:${mergeFinalized ? '是' : '否(还有人工冲突待处理)'}\n`);
      if (mergeFinalized) {
        stdout.write(`重新裁剪补删的文件:${rePrunePlan.length} 个${rePruneCommitted ? '(已自动提交)' : ''}\n`);
      }
      stdout.write(`\n下一步:\n${nextSteps.map(step => `- ${step}`).join('\n')}\n`);
    }

    // 退出码区分"完全干净可以继续"和"还有冲突待人工处理",方便脚本化判断。
    return manual.length > 0 ? 2 : 0;
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
  classifyConflicts,
  listConflictedFiles,
  buildExcludedPathSet,
};
