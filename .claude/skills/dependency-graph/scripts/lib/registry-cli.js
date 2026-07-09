/**
 * 4 个 generator(rule/skill/agent/hook)共用的 CLI 样板。
 *
 * 每个 generator 只需要提供自己的 generateRegistry 和基本元数据
 * (类型名、默认输出路径、计数字段、默认仓库根目录),就能得到一致的
 * --json / --write / --check CLI 行为,避免四处复制 70 行相同的样板代码。
 */

'use strict';

const fs = require('fs');
const path = require('path');

// 本文件位于 .claude/skills/dependency-graph/scripts/lib/,向上两层就是 skill 根目录。
// 所有写盘操作都必须落在这个目录内,防止未来被外部调用者传入危险路径。
const SKILL_DIR = path.resolve(path.join(__dirname, '..', '..'));

function assertWithinSkillDir(targetPath) {
  const resolved = path.resolve(targetPath);
  const prefix = `${SKILL_DIR}${path.sep}`;
  if (resolved !== SKILL_DIR && !resolved.startsWith(prefix)) {
    throw new Error(`禁止写入 ${targetPath}:必须位于 ${SKILL_DIR} 之内`);
  }
}

function formatRegistry(registry) {
  return `${JSON.stringify(registry, null, 2)}\n`;
}

function writeRegistry(registry, outputPath) {
  assertWithinSkillDir(outputPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, formatRegistry(registry), 'utf8');
}

function checkRegistry(registry, outputPath) {
  const expected = formatRegistry(registry);
  let current;

  try {
    current = fs.readFileSync(outputPath, 'utf8');
  } catch (error) {
    throw new Error(`读取 ${outputPath} 失败:${error.message}`);
  }

  if (current !== expected) {
    throw new Error(`${outputPath} 已过期,请重新运行 --write`);
  }
}

function parseArgs(argv, allowedFlags = ['--json', '--write', '--check']) {
  const allowed = new Set(allowedFlags);
  const flags = new Set();

  for (const arg of argv) {
    if (!allowed.has(arg)) {
      throw new Error(`未知参数:${arg}`);
    }
    flags.add(arg);
  }

  return {
    json: flags.has('--json'),
    write: flags.has('--write'),
    check: flags.has('--check'),
  };
}

function createRegistryRunner(options) {
  const {
    typeName,
    generateRegistry,
    defaultOutputPath,
    countField,
    defaultRoot,
  } = options;

  function run(argv = process.argv.slice(2), runOptions = {}) {
    const stdout = runOptions.stdout || process.stdout;
    const stderr = runOptions.stderr || process.stderr;
    const outputPath = runOptions.outputPath || defaultOutputPath;

    try {
      const args = parseArgs(argv, runOptions.allowedFlags);
      const registry = generateRegistry({ root: runOptions.root || defaultRoot });

      if (args.check) {
        checkRegistry(registry, outputPath);
        stdout.write(`${typeName} registry 已是最新。\n`);
        return 0;
      }

      if (args.write) {
        writeRegistry(registry, outputPath);
        stdout.write(`${typeName} registry 已写入 ${outputPath}\n`);
        return 0;
      }

      stdout.write(args.json ? formatRegistry(registry) : `${typeName} 总数:${registry[countField]}\n`);
      return 0;
    } catch (error) {
      stderr.write(`${error.message}\n`);
      return 1;
    }
  }

  return {
    formatRegistry,
    writeRegistry,
    checkRegistry,
    parseArgs,
    run,
  };
}

module.exports = {
  assertWithinSkillDir,
  createRegistryRunner,
  formatRegistry,
  writeRegistry,
  checkRegistry,
  parseArgs,
};
