#!/usr/bin/env node
/**
 * 递归扫描 rules 目录下所有子目录里的 .md 文件,生成 rule 的 extends 继承关系
 * + agent/skill 引用关系的 registry(JSON)。
 *
 * 完全自包含在 .claude/skills/dependency-graph/ 目录下:只读取
 * scripts/ci/generate-command-registry.js 已导出的 extractReferences(),
 * 不修改那个文件,也不写仓库里除本 skill 自己 data/ 目录之外的任何地方。
 *
 * 用法:
 *   node generate-rule-registry.js          # 打印统计,不落盘
 *   node generate-rule-registry.js --json   # 打印完整 JSON,不落盘
 *   node generate-rule-registry.js --write  # 写入 data/rule-registry.json
 *   node generate-rule-registry.js --check  # 校验 data/rule-registry.json 是否与当前仓库一致
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SKILL_DIR, '..', '..', '..');
const DEFAULT_OUTPUT_PATH = path.join(SKILL_DIR, 'data', 'rule-registry.json');

const {
  extractFrontmatter,
  extractProseReferences,
  listKnownAgents,
  listKnownSkills,
  normalizePath,
  walkMarkdownFiles,
} = require('./lib/reference-helpers');

const { createRegistryRunner } = require('./lib/registry-cli');

// 注意:这里的 REPO_ROOT 是"这个脚本文件实际所在的真实仓库根目录",跟下面
// generateRegistry() 里的 root 参数(即将来要扫描的目标目录,自测时会换成
// 临时 fixture 目录)是两个不同的概念——extractReferences 只是一段纯函数逻辑
// (输入文本 + 已知名单,输出匹配结果),跟"扫描哪个目录"完全无关,所以永远从
// 真实仓库加载它就够了,不需要跟着 root 参数变。
const {
  extractReferences,
} = require(path.join(REPO_ROOT, 'scripts', 'ci', 'generate-command-registry'));

// 从 frontmatter 行数组里挑出 paths: 这个 YAML 列表字段,例如:
//   paths:
//     - "**/*.java"
function extractPaths(frontmatterLines) {
  const paths = [];
  let inPaths = false;

  for (const line of frontmatterLines) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths) {
      const item = line.match(/^\s+-\s*(.+)$/);
      if (item) {
        paths.push(item[1].trim().replace(/^['"]/, '').replace(/['"]$/, ''));
        continue;
      }
      inPaths = false;
    }
  }

  return paths;
}

// 解析形如 "> This file extends [common/coding-style.md](../common/coding-style.md)"
// 的一行,拿到括号里的相对链接,再按"当前文件所在目录"解析成绝对路径,最后
// 换算成相对 rules/ 根目录的路径,作为统一的 rule id(例如 "common/coding-style.md")。
function extractExtends(content, rulesDir, relativeRulePath) {
  const match = content.match(/^> This file extends \[([^\]]+)\]\(([^)]+)\)/m);
  if (!match) return null;

  const fileDir = path.dirname(path.join(rulesDir, relativeRulePath));
  const resolved = path.resolve(fileDir, match[2]);
  return normalizePath(path.relative(rulesDir, resolved));
}

function processRuleFile(rulesDir, relativePath, knownAgents, knownSkills) {
  const content = fs.readFileSync(path.join(rulesDir, relativePath), 'utf8');
  const frontmatter = extractFrontmatter(content);
  const references = extractProseReferences(content, knownAgents, knownSkills, extractReferences);

  return {
    rule: relativePath,
    path: normalizePath(path.join('rules', relativePath)),
    paths: extractPaths(frontmatter.lines),
    extends: extractExtends(content, rulesDir, relativePath),
    agents: references.agents,
    skills: references.skills,
  };
}

function generateRegistry(options = {}) {
  const root = options.root || REPO_ROOT;
  const rulesDir = path.join(root, 'rules');
  const knownAgents = listKnownAgents(root);
  const knownSkills = listKnownSkills(root);

  const rules = walkMarkdownFiles(rulesDir, rulesDir)
    .map(relativePath => processRuleFile(rulesDir, relativePath, knownAgents, knownSkills));

  // 反向索引:每个被继承的目标文件,分别被哪些文件继承了。放进
  // statistics 里方便人工浏览 JSON 时不用自己再算一遍。
  const extendedBy = {};
  for (const rule of rules) {
    if (rule.extends) {
      extendedBy[rule.extends] = extendedBy[rule.extends] || [];
      extendedBy[rule.extends].push(rule.rule);
    }
  }

  return {
    schemaVersion: 1,
    totalRules: rules.length,
    rules,
    statistics: {
      extendedBy: Object.fromEntries(
        Object.entries(extendedBy).sort(([left], [right]) => left.localeCompare(right))
      ),
    },
  };
}

const { run } = createRegistryRunner({
  typeName: 'rule',
  generateRegistry,
  defaultOutputPath: DEFAULT_OUTPUT_PATH,
  countField: 'totalRules',
  defaultRoot: REPO_ROOT,
});

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  extractExtends,
  extractPaths,
  generateRegistry,
};
