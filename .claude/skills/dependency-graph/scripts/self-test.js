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
const decisionLedger = require('./decision-ledger');
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

// 专门覆盖 decision-ledger.js 的 prune --apply:回归测试"组件文件是本次
// apply 才删除的,同一次调用里对应的 module(如果因此变成全死)也要能被
// 一并清理"这个时序场景——manifestPlan 一旦提前到 applyPrunePlan 之前算,
// 就会看到"文件还在"而漏检,必须跑两次才能补上,这里专门盯着这一点。
// 用独立的临时目录,不跟上面那套 fixture 混用,避免互相干扰。
function testDecisionLedgerManifestCleanup() {
  const root = createFixtureRoot();
  try {
    fs.mkdirSync(path.join(root, 'skills', 'ledger-demo-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'skills', 'ledger-demo-skill', 'SKILL.md'),
      '---\nname: ledger-demo-skill\ndescription: Decision-ledger self-test fixture.\n---\n# Ledger Demo Skill\n'
    );
    // 单独一个不会被这次 prune 动到的 skill,专门用来在 mixed module 里当
    // "始终存活"的那一条——不能跟 ledger-demo-skill 共用,否则它被删掉之后
    // mixed module 会变成全死,测不出"部分死不该被自动改"这条断言。
    fs.mkdirSync(path.join(root, 'skills', 'ledger-alive-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'skills', 'ledger-alive-skill', 'SKILL.md'),
      '---\nname: ledger-alive-skill\ndescription: Stays alive throughout this fixture.\n---\n# Ledger Alive Skill\n'
    );

    fs.mkdirSync(path.join(root, 'manifests'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'manifests', 'install-modules.json'),
      JSON.stringify({
        modules: [
          {
            id: 'ledger-demo-module',
            kind: 'skills',
            description: 'Module whose only path becomes dead in this same prune --apply run.',
            paths: ['skills/ledger-demo-skill'],
          },
          {
            id: 'ledger-mixed-module',
            kind: 'skills',
            description: 'Module mixing a dead path with a still-alive one.',
            paths: ['skills/ledger-alive-skill', 'skills/does-not-exist'],
          },
        ],
      }, null, 2)
    );

    const ledgerPath = path.join(root, 'decisions.json');
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        version: 1,
        entries: [{ id: 'skill:ledger-demo-skill', decision: 'exclude', reason: 'self-test' }],
      }, null, 2)
    );

    // dry-run 阶段 ledger-demo-skill 还没被删,ledger-demo-module 唯一的路径
    // 还活着,不该出现在计划里;ledger-mixed-module 的 does-not-exist 从一
    // 开始就是死的,该被判定为 report-only(还有一条存活路径,不能整块删)。
    const dryRunPlan = decisionLedger.buildManifestCleanupPlan(root);
    assert.strictEqual(
      dryRunPlan.length,
      1,
      'dry-run 阶段只有本来就带着固定死路径的 mixed module,demo module 的路径还没被删,不该出现在计划里'
    );
    assert.strictEqual(dryRunPlan[0].moduleId, 'ledger-mixed-module', 'dry-run 阶段唯一该出现的是 mixed module');
    assert.strictEqual(dryRunPlan[0].action, 'report-only', 'mixed module 在组件真正删除前就该是 report-only');

    // CLI 层的 dry-run(`prune`,不加 --apply)不只是查"现在"的死路径,还要
    // 模拟"如果真的 --apply 了会怎样"——ledger-demo-skill 还没被删,但它是
    // ledger-demo-module 唯一的路径,一旦 apply 就会让这个 module 变成全死,
    // dry-run 的预览应该提前把这个后果显示出来,而不是等用户执行完 --apply
    // 才发现多删了一个 module。同时验证 dry-run 本身绝不改动磁盘。
    const dryRunOutput = [];
    const dryRunStream = { write: chunk => dryRunOutput.push(chunk) };
    const dryRunExitCode = decisionLedger.run(['prune'], {
      root,
      ledgerPath,
      stdout: dryRunStream,
      stderr: dryRunStream,
    });
    assert.strictEqual(dryRunExitCode, 0, 'CLI 层 dry-run 应该成功退出');

    const dryRunText = dryRunOutput.join('');
    assert.ok(
      dryRunText.includes('将删除整个 module') && dryRunText.includes('ledger-demo-module'),
      'CLI dry-run 应该提前预告 ledger-demo-module 在 --apply 之后会变成全死' +
        '(回归测试:曾经 dry-run 只查磁盘现状,不模拟即将发生的组件删除,完全不会提示这个后果)'
    );
    assert.ok(
      dryRunText.includes('需人工判断') && dryRunText.includes('ledger-mixed-module'),
      'CLI dry-run 也该照常报告 mixed module 的固有死路径'
    );
    assert.ok(
      fs.existsSync(path.join(root, 'skills', 'ledger-demo-skill')),
      'CLI dry-run 不应该真的删除任何组件文件'
    );
    assert.ok(
      JSON.parse(fs.readFileSync(path.join(root, 'manifests', 'install-modules.json'), 'utf8'))
        .modules.some(module => module.id === 'ledger-demo-module'),
      'CLI dry-run 不应该真的改动 manifests/install-modules.json'
    );

    const capturedOutput = [];
    const fakeStream = { write: chunk => capturedOutput.push(chunk) };
    const exitCode = decisionLedger.run(['prune', '--apply'], {
      root,
      ledgerPath,
      stdout: fakeStream,
      stderr: fakeStream,
    });

    assert.strictEqual(exitCode, 0, 'prune --apply 应该成功退出');
    assert.ok(
      !fs.existsSync(path.join(root, 'skills', 'ledger-demo-skill')),
      '组件文件应该被删除'
    );

    const manifestAfter = JSON.parse(
      fs.readFileSync(path.join(root, 'manifests', 'install-modules.json'), 'utf8')
    );
    const moduleIds = manifestAfter.modules.map(module => module.id);
    assert.ok(
      !moduleIds.includes('ledger-demo-module'),
      '同一次 prune --apply 里,组件被删除后立刻变成全死的 module 应该被一并清理' +
        '(回归测试:曾因 manifestPlan 计算时机在删除之前而漏检,需要跑第二次才补上)'
    );
    assert.ok(
      moduleIds.includes('ledger-mixed-module'),
      '混合了存活路径的 module 不应该被自动删除'
    );

    const mixedModule = manifestAfter.modules.find(module => module.id === 'ledger-mixed-module');
    assert.deepStrictEqual(
      mixedModule.paths,
      ['skills/ledger-alive-skill', 'skills/does-not-exist'],
      '混合 module 的 paths 数组不该被自动改动,即使其中一条已经失效'
    );

    const outputText = capturedOutput.join('');
    assert.ok(
      outputText.includes('已删除整个 module') && outputText.includes('ledger-demo-module'),
      '--apply 模式下应该在输出里报告已删除的 module'
    );
    assert.ok(
      outputText.includes('需人工判断') && outputText.includes('ledger-mixed-module'),
      '混合 module 应该在输出里被报告为需要人工判断,而不是被静默处理'
    );
  } finally {
    cleanupFixtureRoot(root);
  }
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

    testDecisionLedgerManifestCleanup();

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
