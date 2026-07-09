#!/usr/bin/env node
/**
 * 扫描 agents/*.md,生成 agent 对 skill/agent 的引用关系 registry(JSON)。
 *
 * 完全自包含在 .claude/skills/dependency-graph/ 目录下:只读取
 * scripts/ci/generate-command-registry.js 已导出的 extractReferences(),
 * 不修改那个文件,也不写仓库里除本 skill 自己 data/ 目录之外的任何地方。
 *
 * 用法:
 *   node generate-agent-registry.js          # 打印统计,不落盘
 *   node generate-agent-registry.js --json   # 打印完整 JSON,不落盘
 *   node generate-agent-registry.js --write  # 写入 data/agent-registry.json
 *   node generate-agent-registry.js --check  # 校验 data/agent-registry.json 是否与当前仓库一致
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SKILL_DIR, '..', '..', '..');
const DEFAULT_OUTPUT_PATH = path.join(SKILL_DIR, 'data', 'agent-registry.json');

const {
  extractFrontmatter,
  extractProseReferences,
  listKnownAgents,
  listKnownSkills,
  normalizePath,
} = require('./lib/reference-helpers');

const { createRegistryRunner } = require('./lib/registry-cli');

// 同 generate-rule-registry.js 里的说明:extractReferences 是纯函数逻辑,
// 跟"扫描哪个目录"无关,永远从真实仓库加载即可,不需要跟着 root 参数变。
const {
  extractReferences,
} = require(path.join(REPO_ROOT, 'scripts', 'ci', 'generate-command-registry'));

function listAgentFiles(agentsDir) {
  if (!fs.existsSync(agentsDir)) return [];
  return fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name.replace(/\.md$/, ''))
    .sort();
}

// 从 frontmatter 行数组里按 key 取单行字段值(model、tools),去掉两端引号。
function extractFrontmatterField(frontmatterLines, key) {
  const line = frontmatterLines.find(l => new RegExp(`^${key}:\\s*(.+)$`).test(l));
  if (!line) return null;
  const match = line.match(new RegExp(`^${key}:\\s*(.+)$`));
  return match ? match[1].trim().replace(/^['"]/, '').replace(/['"]$/, '') : null;
}

function processAgentFile(agentsDir, agentName, knownAgents, knownSkills) {
  const relativePath = normalizePath(path.join('agents', `${agentName}.md`));
  const content = fs.readFileSync(path.join(agentsDir, `${agentName}.md`), 'utf8');
  const frontmatter = extractFrontmatter(content);
  const references = extractProseReferences(content, knownAgents, knownSkills, extractReferences);

  return {
    agent: agentName,
    path: relativePath,
    model: extractFrontmatterField(frontmatter.lines, 'model'),
    tools: extractFrontmatterField(frontmatter.lines, 'tools'),
    // 一个 agent 在自己的 prompt 里提到自己的名字,不算真正的依赖边,过滤掉。
    agents: references.agents.filter(name => name !== agentName),
    skills: references.skills,
  };
}

function generateRegistry(options = {}) {
  const root = options.root || REPO_ROOT;
  const agentsDir = path.join(root, 'agents');
  const knownAgents = listKnownAgents(root);
  const knownSkills = listKnownSkills(root);

  const agents = listAgentFiles(agentsDir)
    .map(agentName => processAgentFile(agentsDir, agentName, knownAgents, knownSkills));

  const skillUsage = {};
  const agentUsage = {};
  for (const agent of agents) {
    for (const ref of agent.skills) {
      skillUsage[ref] = (skillUsage[ref] || 0) + 1;
    }
    for (const ref of agent.agents) {
      agentUsage[ref] = (agentUsage[ref] || 0) + 1;
    }
  }

  return {
    schemaVersion: 1,
    totalAgents: agents.length,
    agents,
    statistics: {
      skillUsage: Object.fromEntries(
        Object.entries(skillUsage).sort(([left], [right]) => left.localeCompare(right))
      ),
      agentUsage: Object.fromEntries(
        Object.entries(agentUsage).sort(([left], [right]) => left.localeCompare(right))
      ),
    },
  };
}

const { run } = createRegistryRunner({
  typeName: 'agent',
  generateRegistry,
  defaultOutputPath: DEFAULT_OUTPUT_PATH,
  countField: 'totalAgents',
  defaultRoot: REPO_ROOT,
});

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  generateRegistry,
  listAgentFiles,
};
