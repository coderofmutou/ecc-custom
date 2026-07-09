#!/usr/bin/env node
/**
 * 扫描 skills 目录下每个子目录的 SKILL.md,生成 skill 之间(以及 skill 对
 * agent)的引用关系 registry(JSON)。
 *
 * 完全自包含在 .claude/skills/dependency-graph/ 目录下:只读取
 * scripts/ci/generate-command-registry.js 已导出的 extractDescription()/
 * extractReferences(),不修改那个文件,也不写仓库里除本 skill 自己 data/
 * 目录之外的任何地方。
 *
 * 用法:
 *   node generate-skill-registry.js          # 打印统计,不落盘
 *   node generate-skill-registry.js --json   # 打印完整 JSON,不落盘
 *   node generate-skill-registry.js --write  # 写入 data/skill-registry.json
 *   node generate-skill-registry.js --check  # 校验 data/skill-registry.json 是否与当前仓库一致
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SKILL_DIR = path.join(__dirname, '..');
const REPO_ROOT = path.join(SKILL_DIR, '..', '..', '..');
const DEFAULT_OUTPUT_PATH = path.join(SKILL_DIR, 'data', 'skill-registry.json');

const {
  extractProseReferences,
  listKnownAgents,
  listKnownSkills,
  normalizePath,
} = require('./lib/reference-helpers');

const { createRegistryRunner } = require('./lib/registry-cli');

const {
  extractDescription,
  extractReferences,
} = require(path.join(REPO_ROOT, 'scripts', 'ci', 'generate-command-registry'));

function listSkillDirs(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  return fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md')))
    .map(entry => entry.name)
    .sort();
}

function processSkillDir(skillsDir, skillName, knownAgents, knownSkills) {
  const relativePath = normalizePath(path.join('skills', skillName, 'SKILL.md'));
  const content = fs.readFileSync(path.join(skillsDir, skillName, 'SKILL.md'), 'utf8');
  const references = extractProseReferences(content, knownAgents, knownSkills, extractReferences);

  return {
    skill: skillName,
    path: relativePath,
    description: extractDescription(content),
    agents: references.agents,
    // 一个 skill 在自己文档里提到自己的名字,不算真正的依赖边,过滤掉。
    skills: references.skills.filter(name => name !== skillName),
  };
}

function generateRegistry(options = {}) {
  const root = options.root || REPO_ROOT;
  const skillsDir = path.join(root, 'skills');
  const knownAgents = listKnownAgents(root);
  const knownSkills = listKnownSkills(root);

  const skills = listSkillDirs(skillsDir)
    .map(skillName => processSkillDir(skillsDir, skillName, knownAgents, knownSkills));

  const skillUsage = {};
  const agentUsage = {};
  for (const skill of skills) {
    for (const ref of skill.skills) {
      skillUsage[ref] = (skillUsage[ref] || 0) + 1;
    }
    for (const ref of skill.agents) {
      agentUsage[ref] = (agentUsage[ref] || 0) + 1;
    }
  }

  return {
    schemaVersion: 1,
    totalSkills: skills.length,
    skills,
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
  typeName: 'skill',
  generateRegistry,
  defaultOutputPath: DEFAULT_OUTPUT_PATH,
  countField: 'totalSkills',
  defaultRoot: REPO_ROOT,
});

if (require.main === module) {
  process.exit(run());
}

module.exports = {
  generateRegistry,
  listSkillDirs,
};
