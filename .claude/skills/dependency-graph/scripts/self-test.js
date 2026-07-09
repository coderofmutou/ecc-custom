#!/usr/bin/env node
/**
 * .claude/skills/dependency-graph 的轻量自测脚本——不接入仓库的 npm test,手动运行:
 *   node .claude/skills/dependency-graph/scripts/self-test.js
 *
 * 在临时目录下(fs.mkdtempSync,跟 tests/ci/command-registry.test.js 用的是
 * 同一套手法)搭一个迷你的"假仓库"目录结构,跑一遍每个 generator 和合并后的
 * 图,其中故意埋了一个指向不存在目标的引用,专门验证孤儿检测真的能抓出来。
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ruleRegistry = require('./generate-rule-registry');
const skillRegistry = require('./generate-skill-registry');
const agentRegistry = require('./generate-agent-registry');
const hookRegistry = require('./generate-hook-registry');
const { buildGraph, findDependents, findUses, findOrphans } = require('./relationship-graph');

function createFixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dependency-graph-self-test-'));
}

function cleanupFixtureRoot(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// 搭一套最小可用的假仓库:一个真实的 skill/agent,一条 extends 关系,
// 一条指向"确实不存在"的 skill 引用(missing-skill,用来验证孤儿检测),
// 以及一个指向不存在脚本的 hook(同样用来验证孤儿检测)。
function writeFixture(root) {
  fs.mkdirSync(path.join(root, 'rules', 'common'), { recursive: true });
  fs.mkdirSync(path.join(root, 'rules', 'demo'), { recursive: true });
  fs.mkdirSync(path.join(root, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'demo-skill'), { recursive: true });
  fs.mkdirSync(path.join(root, 'commands'), { recursive: true });
  fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'manifests'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'rules', 'common', 'coding-style.md'),
    '# Common Coding Style\n\nUse **demo-agent** agent for reviews. See skill: `demo-skill` for details.\n'
  );

  fs.writeFileSync(
    path.join(root, 'rules', 'demo', 'coding-style.md'),
    '---\npaths:\n  - "**/*.demo"\n---\n> This file extends [common/coding-style.md](../common/coding-style.md) with Demo-specific content.\n\nSee skill: `missing-skill` for a reference that does not exist (orphan test).\n'
  );

  fs.writeFileSync(
    path.join(root, 'agents', 'demo-agent.md'),
    '---\nmodel: sonnet\ntools: ["Read"]\n---\n# Demo Agent\n'
  );

  fs.writeFileSync(
    path.join(root, 'skills', 'demo-skill', 'SKILL.md'),
    '---\nname: demo-skill\ndescription: Demo skill for self-test.\n---\n# Demo Skill\n'
  );

  fs.writeFileSync(
    path.join(root, 'commands', 'demo.md'),
    '---\ndescription: Demo command.\n---\n# Demo Command\n\nUse `Task` with `subagent_type: "demo-agent"`.\n'
  );

  fs.writeFileSync(
    path.join(root, 'hooks', 'hooks.json'),
    JSON.stringify({
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            id: 'pre:bash:demo',
            description: 'Demo hook',
            hooks: [{ type: 'command', command: 'node scripts/hooks/does-not-exist.js' }],
          },
        ],
      },
    }, null, 2)
  );

  // 一个 module 指向真实存在的 demo-skill(测试 installs_skill 边正常建立),
  // 另一个指向根本不存在的 skill(测试这条路径也会被孤儿检测抓出来,跟
  // rules/agents/hooks 那几类死引用走的是同一套机制)。
  fs.writeFileSync(
    path.join(root, 'manifests', 'install-modules.json'),
    JSON.stringify({
      modules: [
        {
          id: 'demo-module',
          kind: 'skills',
          description: 'Demo module for self-test.',
          paths: ['skills/demo-skill'],
        },
        {
          id: 'broken-module',
          kind: 'skills',
          description: 'Demo module pointing at a missing skill.',
          paths: ['skills/missing-install-skill'],
        },
      ],
    }, null, 2)
  );
}

function run() {
  const root = createFixtureRoot();
  let failures = 0;

  try {
    writeFixture(root);

    const rules = ruleRegistry.generateRegistry({ root });
    assert.strictEqual(rules.totalRules, 2, '应该扫到 2 条 fixture 规则');
    const demoRule = rules.rules.find(r => r.rule === 'demo/coding-style.md');
    assert.ok(demoRule, 'demo 规则应该存在');
    assert.strictEqual(demoRule.extends, 'common/coding-style.md', 'extends 应该解析到 common/coding-style.md');
    assert.deepStrictEqual(demoRule.paths, ['**/*.demo'], 'paths frontmatter 应该被提取出来');
    assert.deepStrictEqual(demoRule.skills, ['missing-skill'], 'demo 规则应该引用到 missing-skill(即使它不存在)');

    const commonRule = rules.rules.find(r => r.rule === 'common/coding-style.md');
    assert.deepStrictEqual(commonRule.agents, ['demo-agent'], '"**demo-agent** agent" 这种写法应该被识别为 agent 引用');
    assert.deepStrictEqual(commonRule.skills, ['demo-skill'], '反引号包裹的 skill 引用应该被识别出来');

    const skills = skillRegistry.generateRegistry({ root });
    assert.strictEqual(skills.totalSkills, 1, '应该扫到 1 个 fixture skill');

    const agents = agentRegistry.generateRegistry({ root });
    assert.strictEqual(agents.totalAgents, 1, '应该扫到 1 个 fixture agent');

    const hooks = hookRegistry.generateRegistry({ root });
    assert.strictEqual(hooks.totalHooks, 1, '应该扫到 1 个 fixture hook');
    assert.strictEqual(hooks.statistics.brokenScriptReferences.length, 1, '指向不存在脚本的 hook 应该被标记为 broken');

    const graph = buildGraph(root);
    assert.ok(graph.nodes.has('rule:demo/coding-style.md'), '图里应该有 demo 规则节点');
    assert.ok(graph.nodes.has('agent:demo-agent'), '图里应该有 demo agent 节点');
    assert.ok(graph.nodes.has('module:demo-module'), '图里应该有 manifests/install-modules.json 里的 module 节点');

    const dependents = findDependents(graph, 'rule:common/coding-style.md');
    assert.ok(
      dependents.some(entry => entry.from === 'rule:demo/coding-style.md' && entry.type === 'extends'),
      'demo 规则应该通过 extends 成为 common/coding-style.md 的依赖方'
    );

    const uses = findUses(graph, 'command:demo');
    assert.ok(
      uses.some(entry => entry.to === 'agent:demo-agent'),
      'demo 命令应该用到了 demo-agent'
    );

    const moduleUses = findUses(graph, 'module:demo-module');
    assert.ok(
      moduleUses.some(entry => entry.to === 'skill:demo-skill' && entry.type === 'installs_skill'),
      'demo-module 应该通过 installs_skill 边关联到 skill:demo-skill'
    );

    // 这两个断言是整个工具存在的意义:验证"引用了已删除/不存在的目标"确实
    // 会被识别为孤儿,而不是像最初那版实现一样,因为提取逻辑自带存在性过滤,
    // 天生就查不出真正的死链接。
    const orphans = findOrphans(graph);
    assert.ok(
      orphans.some(entry => entry.from === 'rule:demo/coding-style.md' && entry.to === 'skill:missing-skill'),
      '引用一个不存在的 skill 应该在孤儿列表里出现'
    );
    assert.ok(
      orphans.some(entry => entry.from === 'hook:pre:bash:demo' && entry.to === 'script:scripts/hooks/does-not-exist.js'),
      '引用一个不存在的 hook 脚本应该在孤儿列表里出现'
    );
    assert.ok(
      orphans.some(entry => entry.from === 'module:broken-module' && entry.to === 'skill:missing-install-skill'),
      'install module 里指向不存在 skill 的路径也应该在孤儿列表里出现'
    );

    console.log('self-test: 全部断言通过');
  } catch (error) {
    failures += 1;
    console.error('self-test 失败:', error.message);
  } finally {
    cleanupFixtureRoot(root);
  }

  return failures === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(run());
}

module.exports = { run };
