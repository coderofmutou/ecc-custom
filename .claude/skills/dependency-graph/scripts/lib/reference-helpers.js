/**
 * rule/skill/agent 三个 generator 共用的解析辅助函数。
 *
 * 特意保持完全局限在 .claude/skills/dependency-graph/ 目录内部——除了只读 require
 * scripts/ci/generate-command-registry.js 已导出的 extractReferences()(从不
 * 修改该文件、也从不往里写任何东西),仓库里没有其他文件引用本文件,本文件
 * 也不引用仓库其他任何脚本。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Windows 上 path.relative 返回反斜杠,统一转成正斜杠,保证生成的 JSON 在
// 不同操作系统上跑出来是同一份内容(否则 Windows/macOS/Linux 会生成不同的
// rule id,图谱就对不上了)。
function normalizePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

// 递归找出一个目录下所有 .md 文件。仓库里没有现成的、可以只读复用的递归遍历
// 工具,所以这里自己写一个(逻辑很简单,没必要为此去改动仓库根目录的脚本)。
function walkMarkdownFiles(dir, base) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdownFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(normalizePath(path.relative(base, full)));
    }
  }
  return results.sort();
}

// 列出 agents/*.md 对应的 agent 名字集合。注意:generate-command-registry.js
// 里也有一个同名函数,但它没有被导出(module.exports 里没有它),所以这里只能
// 自己重新实现——这几行是纯粹的目录读取,没有值得复用的复杂逻辑,不算重复。
function listKnownAgents(root) {
  const agentsDir = path.join(root, 'agents');
  if (!fs.existsSync(agentsDir)) return new Set();
  return new Set(
    fs.readdirSync(agentsDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => entry.name.replace(/\.md$/, ''))
  );
}

// 列出 skills/*/SKILL.md 对应的 skill 名字集合,同上,原因也一样。
function listKnownSkills(root) {
  const skillsDir = path.join(root, 'skills');
  if (!fs.existsSync(skillsDir)) return new Set();
  return new Set(
    fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(entry => (
        entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md'))
      ))
      .map(entry => entry.name)
  );
}

// 提取 YAML frontmatter(--- 包裹的那一段),返回原始行数组,后续各 generator
// 自己再从行数组里挑需要的字段(paths、model、tools 等)。
function extractFrontmatter(content) {
  // 去掉可能存在的 UTF-8 BOM(U+FEFF),否则第一行的 "---" 匹配不上。
  const clean = content.replace(/^﻿/, '');
  const match = clean.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { present: false, lines: [] };
  return { present: true, lines: match[1].split(/\r?\n/) };
}

// 把 ``` 围栏代码块整段挖掉。这是为了避免下面 collectExplicitAgentRefs 里的
// "agent:" 前缀误伤——见那个函数上面的详细说明。
function stripFencedCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, '');
}

// ============================================================================
// 为什么不能直接复用 generate-command-registry.js 的 extractReferences(),
// 需要在这里额外补一套"不做存在性过滤"的提取逻辑?
//
// extractReferences() 的设计目标是"列出这个 command 实际用到的、依然存在的
// agent/skill",所以它把每一个正则匹配结果都拿去跟"当前仓库里真实存在的
// agent/skill 名单"做比对,不在名单里的匹配会被直接丢弃。这对它自己的用途是
// 对的,但对我们恰恰是反的:我们要检测的"孤儿引用"就是"引用了一个已经不存在
// 的目标",而一个自带存在性过滤的提取器,天生就不可能报告出一个不存在的名字
// ——用它我们永远也查不出被删掉的引用。
//
// 所以下面这几个 collectExplicit*Refs 函数,专门针对"写法本身就足够明确、
// 不太可能是误伤"的引用标记(比如 "skill: `x`"、"subagent_type: x"、
// "agents/x.md"、"skills/x/SKILL.md"、"../x/SKILL.md"、"**x** agent"),
// 不做存在性过滤,直接把捕获到的名字原样记下来——它是否真的存在,交给后面
// relationship-graph.js 的孤儿检测去判断。
//
// 只有写法本身就含糊、没有明确标记的形式(裸的加粗词、裸的 "x agent" 短语),
// 才继续用已知名单过滤,否则乱七八糟的加粗文本、英文短语全都会被误判成引用。
//
// 实测踩过两个坑,直接决定了下面正则的写法:
//   1. 围栏代码块("```bash")会撞上裸的 "agent:" 前缀——原文经常这么写:
//      "...再加一个专门清理的 agent:\n\n```bash\n<命令>"。如果不先挖掉围栏,
//      "agent:" 后面紧跟的语言标记(比如 bash)就会被误判成一个 agent 名字。
//      解决办法:先用 stripFencedCodeBlocks 挖掉围栏,再匹配。
//   2. 裸的 "skill:" 前缀(不要求反引号)会撞上一些报告格式里的标签行,比如
//      "Skill: Scans setup → 16 agents..."、"Skill: Full report..." ——这些
//      跟"引用某个 skill"完全无关,只是把 "Skill:" 当成一个字段名在用。
//      仓库里真正的 skill 引用,写法永远是反引号包裹的两种形式之一:
//      "skill: `x`"(反引号只包住标识符)或 "`skill: x`"(反引号包住整句话,
//      常见于 "`skill: cpp-coding-standards`" 这种写法)。所以这里不是先统一
//      去掉反引号再匹配,而是要求正则里必须出现反引号才算数。
// 至于裸的、没有任何标记的 "agent:" 前缀(比如单独一个 "agent:" 后面直接接
// 别的内容),因为跟"...的 X agent:"这种引出代码块的英文习惯写法完全没法
// 区分,直接不纳入"不过滤"的这一档,只在 collectBareAgentRefs 里按已知名单
// 过滤着用。
// ============================================================================
function collectExplicitSkillRefs(content) {
  const refs = new Set();
  const withoutFences = stripFencedCodeBlocks(content);
  const patterns = [
    /\bskill:\s*`([a-z][a-z0-9-]*)`/gi,
    /`skill:\s*([a-z][a-z0-9-]*)`/gi,
    /\bskills\/([a-z][a-z0-9-]*)\/SKILL\.md\b/gi,
    /\.\.\/([a-z][a-z0-9-]*)\/SKILL\.md/gi,
  ];
  for (const pattern of patterns) {
    for (const match of withoutFences.matchAll(pattern)) {
      refs.add(match[1].toLowerCase());
    }
  }
  return refs;
}

function collectExplicitAgentRefs(content) {
  const refs = new Set();
  const withoutFences = stripFencedCodeBlocks(content);
  const patterns = [
    // subagent_type: "code-reviewer" / subagent_type: `code-reviewer`
    /\bsubagent(?:_type)?:\s*['"]?`?([a-z][a-z0-9-]*)/gi,
    // agents/planner.md 这种直接写文件路径的引用方式
    /\bagents\/([a-z][a-z0-9-]*)\.md\b/gi,
    // "**planner** agent" —— 加粗名字紧跟 "agent" 一词,足够明确
    /\*\*([a-z][a-z0-9-]*)\*\*\s+agent\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of withoutFences.matchAll(pattern)) {
      refs.add(match[1].toLowerCase());
    }
  }
  return refs;
}

// 下面两个是"含糊形式",没有专门的标记把它跟"这是一个 skill/agent 引用"绑在
// 一起,只能继续按已知名单过滤——否则表格里随便一个加粗单元格、英文句子里的
// "...an agent" 都会被当成引用,孤儿列表会全是噪音。
function collectBoldNameRefs(content, knownNames) {
  const refs = new Set();
  const withoutFences = stripFencedCodeBlocks(content);
  for (const match of withoutFences.matchAll(/\*\*([a-z][a-z0-9-]*)\*\*/gi)) {
    const ref = match[1].toLowerCase();
    if (knownNames.has(ref)) refs.add(ref);
  }
  return refs;
}

function collectBareAgentRefs(content, knownAgents) {
  const refs = new Set();
  const withoutFences = stripFencedCodeBlocks(content);
  for (const match of withoutFences.matchAll(/\b([a-z][a-z0-9-]*)\s+agent\b/gi)) {
    const ref = match[1].toLowerCase();
    if (knownAgents.has(ref)) refs.add(ref);
  }
  return refs;
}

// 汇总一个文件里引用到的全部 agent/skill:先跑一遍原版 extractReferences
// (仍然有用,它能兜住一些这里没覆盖到的边缘写法,反正它自带过滤,加进来不会
// 引入新的误报),再叠加上面"明确标记"和"含糊形式"两档提取结果。
function extractProseReferences(content, knownAgents, knownSkills, extractReferences) {
  // extractReferences 本身不做围栏代码块过滤,如果直接把全文(去掉反引号后)
  // 丢给它,```json 示例里的 "agent:x"、"skill:x" 会被它的裸 agent:/skill:
  // 模式误当成真实引用。SKILL.md 的 overrides.json 示例就是因此产生了
  // skill:dependency-graph -> agent:x/skill:x 这类明显误报。所以先挖掉围栏
  // 代码块,再去掉剩余的内联反引号,最后才跑 extractReferences。
  const withoutFences = stripFencedCodeBlocks(content);
  const stripped = withoutFences.replace(/`/g, '');
  const base = extractReferences(stripped, knownAgents, knownSkills);

  const agents = new Set([
    ...base.agents,
    ...collectExplicitAgentRefs(content),
    ...collectBoldNameRefs(content, knownAgents),
    ...collectBareAgentRefs(content, knownAgents),
  ]);
  const skills = new Set([
    ...base.skills,
    ...collectExplicitSkillRefs(content),
    ...collectBoldNameRefs(content, knownSkills),
  ]);

  return {
    agents: Array.from(agents).sort(),
    skills: Array.from(skills).sort(),
  };
}

module.exports = {
  extractFrontmatter,
  extractProseReferences,
  listKnownAgents,
  listKnownSkills,
  normalizePath,
  walkMarkdownFiles,
};
