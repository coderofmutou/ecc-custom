#!/usr/bin/env node
/**
 * 决策台账 CLI:记录"哪些组件的源文件不该留在 fork 里",并据此裁剪仓库、
 * 对比上游变动。跟 overrides.json 是两件不同的事——overrides.json 纠正的是
 * "依赖图的边画得对不对",这里记录的是"要不要把这个组件的源文件留在仓库里"。
 *
 * 用法:
 *   node decision-ledger.js record <id> <include|exclude|pending> --reason "..." [--decided-at <YYYY-MM-DD>] [--hard-dependent "<id>|<note>"]...
 *   node decision-ledger.js list [--decision <include|exclude|pending>] [--json]
 *   node decision-ledger.js prune [--apply] [--json]
 *   node decision-ledger.js diff-upstream [--json]
 *
 * 节点 id 格式跟 relationship-query.js 一致:rule:<path>、skill:<name>、
 * agent:<name>、command:<name>、hook:<id>。
 *
 * 条目里的 `suggestedDecision`/`suggestedAt` 是从外部数据源(比如
 * plugin-overlay 的 catalog.json/pending.json)批量导入的**建议**,不是
 * 决定——`prune` 只认 `decision` 字段,导入建议时必须把 `decision` 留在
 * `pending`,不能直接写成 `exclude`。只有用户通过 `record` 显式确认过的
 * 条目,`decision` 才会变成 `include`/`exclude`。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SKILL_DIR, '..', '..', '..');
const DEFAULT_LEDGER_PATH = path.join(SKILL_DIR, 'data', 'decisions.json');

const { assertWithinSkillDir } = require('./lib/registry-cli');
const { buildGraph, findDependents } = require('./relationship-graph');

const VALID_DECISIONS = new Set(['include', 'exclude', 'pending']);
// hook 定义在共享的 hooks/hooks.json 数组里,不是独立文件——自动裁剪容易
// 误伤同一个文件里其他 hook 的定义,所以裁剪脚本只报告、不代替人工改这个文件。
const PRUNE_UNSUPPORTED_PREFIX = 'hook:';
const TRACKED_PREFIXES = ['rule:', 'skill:', 'agent:', 'command:', 'hook:'];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) {
    return { version: 1, entries: [] };
  }

  let raw;
  try {
    raw = fs.readFileSync(ledgerPath, 'utf8');
  } catch (error) {
    throw new Error(`读取 ${ledgerPath} 失败:${error.message}`);
  }

  try {
    const parsed = JSON.parse(raw);
    return { version: parsed.version || 1, entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch (error) {
    throw new Error(`解析 ${ledgerPath} 失败,请检查 JSON 语法:${error.message}`);
  }
}

function saveLedger(ledger, ledgerPath) {
  assertWithinSkillDir(ledgerPath);
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
}

function findEntry(ledger, id) {
  return ledger.entries.find(entry => entry.id === id);
}

function parseHardDependentFlag(raw) {
  const separatorIndex = raw.indexOf('|');
  if (separatorIndex === -1) {
    return { id: raw, note: '' };
  }
  return { id: raw.slice(0, separatorIndex), note: raw.slice(separatorIndex + 1) };
}

function parseFlags(rest) {
  const flags = {
    reason: null,
    decidedAt: null,
    hardDependents: [],
    decisionFilter: null,
    json: rest.includes('--json'),
    apply: rest.includes('--apply'),
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--reason') {
      flags.reason = rest[index + 1] || null;
      index += 1;
    } else if (arg === '--decided-at') {
      flags.decidedAt = rest[index + 1] || null;
      index += 1;
    } else if (arg === '--hard-dependent') {
      flags.hardDependents.push(parseHardDependentFlag(rest[index + 1] || ''));
      index += 1;
    } else if (arg === '--decision') {
      flags.decisionFilter = rest[index + 1] || null;
      index += 1;
    }
  }

  return flags;
}

function cmdRecord(ledger, argsAfterRecord, { stdout }) {
  const [id, decision] = argsAfterRecord;
  if (!id || !decision) {
    throw new Error('用法:record <id> <include|exclude|pending> --reason "..." [--decided-at <YYYY-MM-DD>] [--hard-dependent "<id>|<note>"]');
  }
  if (!VALID_DECISIONS.has(decision)) {
    throw new Error(`decision 必须是 include|exclude|pending 之一,收到:${decision}`);
  }

  const flags = parseFlags(argsAfterRecord.slice(2));

  let entry = findEntry(ledger, id);
  if (!entry) {
    entry = { id };
    ledger.entries.push(entry);
  }
  entry.decision = decision;
  entry.reason = flags.reason || entry.reason || '';
  entry.decidedAt = flags.decidedAt || todayIso();

  if (flags.hardDependents.length > 0) {
    entry.hardDependents = flags.hardDependents;
  } else if (decision !== 'exclude') {
    delete entry.hardDependents;
  }
  // decision === 'exclude' 且本次没传 --hard-dependent 时,保留之前手动
  // 在 decisions.json 里补充的 hardDependents,不清空。

  stdout.write(`已记录:${id} -> ${decision}\n`);
  return entry;
}

function cmdList(ledger, rest, { stdout }) {
  const flags = parseFlags(rest);
  const entries = flags.decisionFilter
    ? ledger.entries.filter(entry => entry.decision === flags.decisionFilter)
    : ledger.entries;

  if (flags.json) {
    stdout.write(`${JSON.stringify(entries, null, 2)}\n`);
    return;
  }

  if (!entries.length) {
    stdout.write('(空)\n');
    return;
  }
  for (const entry of entries) {
    const suggestion = entry.suggestedDecision ? `  (建议:${entry.suggestedDecision})` : '';
    // reason 是"真正决定"的理由,只在 decision 不是 pending 时才有意义;
    // pending 条目没有 reason,只能看 suggestedReason(导入建议自带的理由,
    // 不代表你的判断)。两者绝不互相回退——避免把建议的理由误当成决定的理由。
    const reasonText = entry.reason || (entry.suggestedReason ? `建议理由:${entry.suggestedReason}` : '');
    stdout.write(`${entry.id}  [${entry.decision}]${suggestion}  ${reasonText}\n`);
  }
}

// skill 的节点 path 指向 skills/<name>/SKILL.md,裁剪要删的是整个目录;
// rule/agent/command 的节点 path 本身就是要删的单个文件。
function resolveComponentPath(graph, id) {
  const node = graph.nodes.get(id);
  if (!node || !node.path) {
    return null;
  }
  if (id.startsWith('skill:')) {
    return path.dirname(node.path);
  }
  return node.path;
}

function buildPrunePlan(ledger, graph, root) {
  const plan = [];
  const resolvedRoot = path.resolve(root);
  const rootWithSep = `${resolvedRoot}${path.sep}`;

  for (const entry of ledger.entries) {
    if (entry.decision !== 'exclude') {
      continue;
    }

    if (entry.id.startsWith(PRUNE_UNSUPPORTED_PREFIX)) {
      plan.push({ id: entry.id, action: 'manual', detail: 'hook 定义共享在 hooks/hooks.json 里,需要手动编辑,不支持自动裁剪' });
      continue;
    }

    const relPath = resolveComponentPath(graph, entry.id);
    if (!relPath) {
      plan.push({ id: entry.id, action: 'skip', detail: '依赖图里找不到这个 id,可能已经被裁剪过或上游改名,建议跑 diff-upstream 核实' });
      continue;
    }

    const absPath = path.resolve(root, relPath);
    // relPath 来自依赖图(不是外部输入),理论上不会越界,但既然要执行真删除,
    // 多一层路径边界检查不吃亏。
    if (absPath !== resolvedRoot && !absPath.startsWith(rootWithSep)) {
      plan.push({ id: entry.id, action: 'skip', detail: `解析出的路径越界,拒绝处理:${relPath}` });
      continue;
    }

    if (!fs.existsSync(absPath)) {
      plan.push({ id: entry.id, action: 'skip', detail: `路径不存在,可能已经被裁剪过:${relPath}` });
      continue;
    }

    plan.push({ id: entry.id, action: 'delete', path: relPath });
  }

  return plan;
}

function applyPrunePlan(plan, root) {
  for (const item of plan) {
    if (item.action !== 'delete') {
      continue;
    }
    fs.rmSync(path.resolve(root, item.path), { recursive: true, force: true });
  }
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`读取 ${label} 失败:${error.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`解析 ${label} 失败,请检查 JSON 语法:${error.message}`);
  }
}

// manifests/install-modules.json 不属于依赖图节点,prune 只删组件文件本身,
// 从来不碰这个共享清单——但组件被删掉后,清单里引用它的 module.paths 条目
// 就变成了死路径。这里只处理"整个 module 全部路径都死了"这一种安全情况
// (跟删一整个组件文件同类风险,可以自动化);只要 module 里还混着存活路径,
// 就只报告、绝不自动编辑这个共享数组——upstream 会持续往这类通用 module 里
// 加新内容,自动改行反而会制造未来合并冲突,判断权必须留给人工。
//
// pendingDeletePaths(可选):即将被 buildPrunePlan 删除、但此刻磁盘上还
// 存在的绝对路径集合。dry-run(没有 --apply)时组件文件还没真的被删,如果
// 不把这些路径当成"已经死了"来算,预览结果就只反映"现在"而不是"apply
// 之后",跟上面组件删除计划"预览即将发生的事"这层语义不一致——用户按
// dry-run 结果确认无误、真正执行 --apply 后,才会突然发现多删了一个 module。
// --apply 模式下调用这个函数时文件已经真删了,传不传这个集合结果一样。
function buildManifestCleanupPlan(root, pendingDeletePaths = new Set()) {
  const manifestPath = path.join(root, 'manifests', 'install-modules.json');
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const manifest = readJson(manifestPath, 'install-modules.json');
  if (!Array.isArray(manifest.modules)) {
    return [];
  }

  const plan = [];
  for (const module of manifest.modules) {
    if (!Array.isArray(module.paths) || module.paths.length === 0) {
      continue;
    }

    const deadPaths = module.paths.filter(relPath => {
      const absPath = path.resolve(root, relPath);
      return !fs.existsSync(absPath) || pendingDeletePaths.has(absPath);
    });
    if (deadPaths.length === 0) {
      continue;
    }

    if (deadPaths.length === module.paths.length) {
      plan.push({ moduleId: module.id, action: 'delete-module', deadPaths });
    } else {
      plan.push({
        moduleId: module.id,
        action: 'report-only',
        deadPaths,
        aliveCount: module.paths.length - deadPaths.length,
      });
    }
  }

  return plan;
}

function applyManifestCleanupPlan(plan, root) {
  const moduleIdsToDelete = new Set(
    plan.filter(item => item.action === 'delete-module').map(item => item.moduleId)
  );
  if (moduleIdsToDelete.size === 0) {
    return;
  }

  const manifestPath = path.join(root, 'manifests', 'install-modules.json');
  const manifest = readJson(manifestPath, 'install-modules.json');
  manifest.modules = manifest.modules.filter(module => !moduleIdsToDelete.has(module.id));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function cmdPrune(ledger, graph, rest, { stdout, root }) {
  const flags = parseFlags(rest);
  const plan = buildPrunePlan(ledger, graph, root);

  if (flags.apply) {
    applyPrunePlan(plan, root);
  }

  // --apply 模式下上面已经真删了,这里传的路径全都已经不存在,是无害的
  // no-op;dry-run 模式下文件还没被删,靠这个集合模拟"apply 之后"的状态,
  // 让 manifestPlan 能预告出"这次 apply 会不会让某个 module 变成全死",
  // 跟上面 plan 那部分"预览即将发生的事"保持同一种语义。
  const pendingDeletePaths = new Set(
    plan.filter(item => item.action === 'delete').map(item => path.resolve(root, item.path))
  );
  const manifestPlan = buildManifestCleanupPlan(root, pendingDeletePaths);

  if (flags.apply) {
    applyManifestCleanupPlan(manifestPlan, root);
  }

  if (flags.json) {
    stdout.write(`${JSON.stringify({ applied: flags.apply, plan, manifestPlan }, null, 2)}\n`);
    return;
  }

  stdout.write(`${flags.apply ? '已执行裁剪:' : '裁剪计划(dry-run,加 --apply 才会真正删除):'}\n\n`);
  if (!plan.length) {
    stdout.write('(没有标记为 exclude 的条目)\n');
  } else {
    for (const item of plan) {
      if (item.action === 'delete') {
        stdout.write(`- [删除] ${item.id}  ${item.path}\n`);
      } else if (item.action === 'manual') {
        stdout.write(`- [需手动] ${item.id}  ${item.detail}\n`);
      } else {
        stdout.write(`- [跳过] ${item.id}  ${item.detail}\n`);
      }
    }
  }

  if (manifestPlan.length) {
    stdout.write('\nmanifests/install-modules.json 里发现死路径:\n');
    for (const item of manifestPlan) {
      if (item.action === 'delete-module') {
        stdout.write(
          `- [${flags.apply ? '已删除整个 module' : '将删除整个 module'}] ${item.moduleId}  (全部 ${item.deadPaths.length} 条路径都已失效)\n`
        );
      } else {
        stdout.write(
          `- [需人工判断,未自动修改] ${item.moduleId}  ${item.deadPaths.length} 条死路径 / ${item.aliveCount} 条仍存活:\n`
        );
        for (const deadPath of item.deadPaths) {
          stdout.write(`    - ${deadPath}\n`);
        }
      }
    }
  }
}

function cmdDiffUpstream(ledger, graph, { stdout, json }) {
  const ledgerIds = new Set(ledger.entries.map(entry => entry.id));
  const graphIds = new Set(
    Array.from(graph.nodes.keys()).filter(id => TRACKED_PREFIXES.some(prefix => id.startsWith(prefix)))
  );

  const newComponents = [...graphIds].filter(id => !ledgerIds.has(id)).sort();
  const danglingDecisions = ledger.entries
    .map(entry => entry.id)
    .filter(id => !graphIds.has(id))
    .sort();

  const result = { newComponents, danglingDecisions };

  if (json) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  stdout.write(`新组件(依赖图里有、台账里没有,需要分类,共 ${newComponents.length} 个):\n`);
  stdout.write(newComponents.length ? `${newComponents.map(id => `- ${id}`).join('\n')}\n` : '(无)\n');
  stdout.write(`\n悬空决策(台账里有、依赖图里已经找不到,可能是上游改名/删除,共 ${danglingDecisions.length} 个):\n`);
  stdout.write(danglingDecisions.length ? `${danglingDecisions.map(id => `- ${id}`).join('\n')}\n` : '(无)\n');
}

function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;
  const root = options.root || REPO_ROOT;
  const ledgerPath = options.ledgerPath || DEFAULT_LEDGER_PATH;

  try {
    const [subcommand, ...rest] = argv;
    const ledger = loadLedger(ledgerPath);

    switch (subcommand) {
      case 'record': {
        const graph = buildGraph(root, options);
        const entry = cmdRecord(ledger, rest, { stdout });
        saveLedger(ledger, ledgerPath);
        if (entry.decision === 'exclude') {
          const dependents = findDependents(graph, entry.id);
          if (dependents.length) {
            stdout.write(`\n以下组件依赖 ${entry.id},排除前请确认是不是强依赖——是的话给这条记录补 hardDependents:\n`);
            stdout.write(`${dependents.map(dependent => `- ${dependent.from}  [${dependent.type}]`).join('\n')}\n`);
          }
        }
        return 0;
      }

      case 'list': {
        cmdList(ledger, rest, { stdout });
        return 0;
      }

      case 'prune': {
        const graph = buildGraph(root, options);
        cmdPrune(ledger, graph, rest, { stdout, root });
        return 0;
      }

      case 'diff-upstream': {
        const graph = buildGraph(root, options);
        cmdDiffUpstream(ledger, graph, { stdout, json: rest.includes('--json') });
        return 0;
      }

      default:
        throw new Error(`未知子命令:${subcommand || '(空)'}。可用:record|list|prune|diff-upstream。`);
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
  loadLedger,
  saveLedger,
  findEntry,
  resolveComponentPath,
  buildPrunePlan,
  applyPrunePlan,
  buildManifestCleanupPlan,
  applyManifestCleanupPlan,
  cmdDiffUpstream,
  run,
};
