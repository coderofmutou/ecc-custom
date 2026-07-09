#!/usr/bin/env node
/**
 * 扫描 hooks/hooks.json,以及 hooks 各子目录下自己的 hooks.json,生成 hook
 * registry(JSON),并核对每个 hook 的 command 字符串里引用的脚本文件是否
 * 真的存在于磁盘上。
 *
 * 完全自包含在 .claude/skills/dependency-graph/ 目录下,不写仓库里除本 skill 自己
 * data/ 目录之外的任何地方。这个文件不需要 require 仓库根目录的任何脚本,
 * 逻辑完全自包含。
 *
 * 用法:
 *   node generate-hook-registry.js          # 打印统计,不落盘
 *   node generate-hook-registry.js --json   # 打印完整 JSON,不落盘
 *   node generate-hook-registry.js --write  # 写入 data/hook-registry.json
 *   node generate-hook-registry.js --check  # 校验 data/hook-registry.json 是否与当前仓库一致
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { createRegistryRunner } = require('./lib/registry-cli');
const { normalizePath } = require('./lib/reference-helpers');

const SKILL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SKILL_DIR, '..', '..', '..');
const DEFAULT_OUTPUT_PATH = path.join(SKILL_DIR, 'data', 'hook-registry.json');

// hooks.json 只有两个已知位置:hooks/hooks.json(主配置)以及每个子目录下自己
// 的 hooks.json(比如 hooks/memory-persistence/hooks.json)。仓库里没有更深
// 层的嵌套,所以这里只扫一层子目录就够了,不需要递归。
function listHookConfigFiles(hooksDir) {
  if (!fs.existsSync(hooksDir)) return [];
  const files = [];

  const rootConfig = path.join(hooksDir, 'hooks.json');
  if (fs.existsSync(rootConfig)) {
    files.push(rootConfig);
  }

  for (const entry of fs.readdirSync(hooksDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const nested = path.join(hooksDir, entry.name, 'hooks.json');
    if (fs.existsSync(nested)) {
      files.push(nested);
    }
  }

  return files.sort();
}

// 从一条 hook 的 command 字符串里(通常是一整段拼起来的 node -e "..." 命令,
// 里面会带着实际要执行的脚本相对路径)抓出所有 "scripts/xxx.js" 形式的路径,
// 逐一核对文件是否真实存在——这是 validate-hooks.js 没做的事(它只校验
// hooks.json 本身的结构,不检查里面引用的脚本文件是否还在)。
function extractScriptRefs(command, root) {
  const refs = [];
  const seen = new Set();

  for (const match of command.matchAll(/scripts\/[\w./-]+\.js/g)) {
    const scriptPath = match[0];
    if (seen.has(scriptPath)) continue;
    seen.add(scriptPath);
    refs.push({
      path: scriptPath,
      exists: fs.existsSync(path.join(root, scriptPath)),
    });
  }

  return refs;
}

// 处理 hooks/hooks.json 这种"生产用"的配置形态:
//   { "hooks": { "PreToolUse": [ { matcher, id, description, hooks: [{command}] }, ... ] } }
function processHookEntry(root, sourceFile, eventName, entry) {
  const scripts = [];
  for (const hook of entry.hooks || []) {
    if (typeof hook.command === 'string') {
      scripts.push(...extractScriptRefs(hook.command, root));
    }
  }

  return {
    id: entry.id || null,
    event: eventName,
    matcher: entry.matcher || null,
    description: entry.description || null,
    sourceFile: normalizePath(path.relative(root, sourceFile)),
    scripts,
  };
}

// hooks/memory-persistence/hooks.json 用的是另一套"仅供参考"的形态:
//   { "events": [ { event, id, script, purpose, blocking }, ... ] }
// 这个文件本身写明"生产环境用的图是 hooks/hooks.json",这份只是文档性质,
// 但里面提到的脚本一样应该真实存在,所以也纳入检查,只是字段名不同,单独处理。
function processReferenceEventEntry(root, sourceFile, entry) {
  const scripts = typeof entry.script === 'string'
    ? [{ path: entry.script, exists: fs.existsSync(path.join(root, entry.script)) }]
    : [];

  return {
    id: entry.id || null,
    event: entry.event || null,
    matcher: null,
    description: entry.purpose || null,
    sourceFile: normalizePath(path.relative(root, sourceFile)),
    scripts,
  };
}

function processHookConfigFile(root, configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(raw);
  const entries = [];

  // 仓库里实际存在两种 hooks.json 结构,靠有没有 "hooks" 字段来判断走哪条路。
  if (config.hooks) {
    for (const [eventName, eventEntries] of Object.entries(config.hooks)) {
      for (const entry of eventEntries) {
        entries.push(processHookEntry(root, configPath, eventName, entry));
      }
    }
  } else if (Array.isArray(config.events)) {
    for (const entry of config.events) {
      entries.push(processReferenceEventEntry(root, configPath, entry));
    }
  }

  return entries;
}

function generateRegistry(options = {}) {
  const root = options.root || REPO_ROOT;
  const hooksDir = path.join(root, 'hooks');

  const hooks = listHookConfigFiles(hooksDir)
    .flatMap(configPath => processHookConfigFile(root, configPath));

  // hooks/hooks.json 是实际生效的生产配置,hooks/*/hooks.json(目前只有
  // memory-persistence)是文档性质的参考,里面可能会重复出现相同 id。
  // listHookConfigFiles 已经把根配置排在前面,所以这里按 id 保留第一次
  // 出现的条目,就能让生产配置优先于参考文档,避免 relationship-graph.js
  // 里后写入的参考文档把前面的生产配置覆盖掉。
  // 注意:没有 id 的条目(通常是示例/参考配置)不能参与按 id 去重,但也不能
  // 因此被整体丢弃——relationship-graph.js 依赖它们生成 hook-config:<sourceFile>
  // 伪节点,用来把它们引用的失效脚本上报为孤儿引用(见该文件与 README 的
  // "已知局限"部分)。之前的写法只在 hooksById 里保留有 id 的条目,相当于把
  // 所有无 id 条目直接过滤没了,那段孤儿检测逻辑因此永远不会被触发。
  const hooksById = new Map();
  const hooksWithoutId = [];
  for (const hook of hooks) {
    if (!hook.id) {
      hooksWithoutId.push(hook);
    } else if (!hooksById.has(hook.id)) {
      hooksById.set(hook.id, hook);
    }
  }
  const dedupedHooks = [...hooksById.values(), ...hooksWithoutId];

  const brokenScripts = [];
  for (const hook of dedupedHooks) {
    for (const script of hook.scripts) {
      if (!script.exists) {
        brokenScripts.push({ hookId: hook.id, sourceFile: hook.sourceFile, script: script.path });
      }
    }
  }

  return {
    schemaVersion: 1,
    totalHooks: dedupedHooks.length,
    hooks: dedupedHooks,
    statistics: {
      brokenScriptReferences: brokenScripts,
    },
  };
}

const { run } = createRegistryRunner({
  typeName: 'hook',
  generateRegistry,
  defaultOutputPath: DEFAULT_OUTPUT_PATH,
  countField: 'totalHooks',
  defaultRoot: REPO_ROOT,
});

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  extractScriptRefs,
  generateRegistry,
  listHookConfigFiles,
};
