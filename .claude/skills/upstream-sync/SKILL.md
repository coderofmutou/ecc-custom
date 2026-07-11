---
name: upstream-sync
description: >
  把上游官方 ECC 仓库(upstream/main)的最新变动同步进这个 fork,自动机械化处理"已经决定要裁剪的组件"产生的合并冲突,保留文件的真实冲突留给人工/Claude 判断。当用户想"同步上游最新代码"、"看看上游有什么新东西"、"处理和上游的合并冲突"时主动使用这个技能。
---

# 上游同步(upstream-sync)

把 `upstream/main`(官方 `affaan-m/ECC`)的变动合并进这个 fork,同时利用 [dependency-graph 的决策台账](../dependency-graph/DECISIONS.md)机械化解决"你已经决定要裁剪的组件"产生的合并冲突——这类冲突不用看上游改了什么,反正要删,可以脚本化处理,不会随时间累积;真正需要人工看的只是你保留、且本地改过的那一小部分文件。完全自包含在 `.claude/skills/upstream-sync/` 内,只读引用 dependency-graph 已导出的函数(`buildGraph`/`loadLedger`/`resolveComponentPath`/`buildPrunePlan`/`applyPrunePlan`),从不修改 dependency-graph 目录下的任何文件。完整设计说明见 [README.md](README.md)。

## 安全约束(必须遵守)

- **只在 `sync/upstream-<date>` 分支操作,绝不直接改 `main`**。合并到 `main` 这一步永远交还给用户自己确认执行。
- **用 `merge` 不用 `rebase`**——fork 的 `main` 可能已经推到远端,`rebase` 改写历史需要 force-push。
- **全程不 `push`**。
- **冲突绝不自动强行合并**:只有命中决策台账里 `decision=exclude` 的组件路径才会被机械化删除解决,其余冲突原样留给人工确认。

## 怎么用

1. **只读检查**,看看上游有什么新变动、会不会碰到你已经裁剪的东西:

   ```bash
   node .claude/skills/upstream-sync/scripts/check-upstream.js
   ```

2. **确认要同步**,在新分支上执行合并:

   ```bash
   node .claude/skills/upstream-sync/scripts/sync-upstream.js --date 2026-07-10
   ```

   退出码 `0` = 完全干净,可以继续;退出码 `2` = 还有需要人工处理的冲突(脚本会列出文件清单和下一步该做什么);其他非 0 = 出错(比如没在 `main` 分支上运行、`upstream` 远程没配置等)。

   两个脚本都支持加 `--json` 输出机器可读结果(比如 `check-upstream.js --json`),方便在后续步骤里直接解析,不用截取人类可读文本。

3. 如果第 2 步提示还有人工冲突,和用户一起逐个判断——参考对应文件的历史内容、`decisions.json` 里有没有相关的 `hardDependents` 说明——处理完 `git add`,`git commit` 完成合并。

4. 合并(不管是脚本自动完成的,还是人工处理完 commit 的)完成后:

   ```bash
   node .claude/skills/dependency-graph/scripts/generate-rule-registry.js --write
   node .claude/skills/dependency-graph/scripts/generate-skill-registry.js --write
   node .claude/skills/dependency-graph/scripts/generate-agent-registry.js --write
   node .claude/skills/dependency-graph/scripts/generate-hook-registry.js --write
   node .claude/skills/dependency-graph/scripts/relationship-graph.js --write
   node .claude/skills/dependency-graph/scripts/relationship-render.js --write
   node .claude/skills/dependency-graph/scripts/decision-ledger.js diff-upstream
   ```

   确认没有新增组件遗漏分类、没有决策指向已经改名/消失的 id。

5. **提交上一步 registry 刷新产生的改动**(`sync-upstream.js` 自己补删的裁剪文件已经自动提交过,但这一步的 registry 刷新是你/Claude 手动跑的,脚本看不到,不会替你提交):

   ```bash
   git add -A
   git commit -m "chore: refresh registries after upstream sync"
   ```

   跳过这一步、直接进入下一步合并回 `main`,可能会被 git 挡在 `checkout` 这一关(未提交改动可能被覆盖),或者更糟——把这批改动当成游离的工作区状态悄悄带过去。

6. 都确认无误后,自己决定要不要把同步分支合并回 `main`:

   ```bash
   git checkout main
   git merge sync/upstream-2026-07-10
   ```

   本技能不会替你执行这一步。

## 和 dependency-graph 的关系

`sync-upstream.js` 只在两处读 dependency-graph 的数据:一是合并冲突分类时读 `decisions.json` 里 `decision=exclude` 的组件路径;二是合并完成后无条件重跑一次 `decision-ledger.js prune`(逻辑,不是子进程调用)补删"上游新增了本该属于已裁剪目录、但因为是全新文件不会触发合并冲突"的内容。如果 `decisions.json` 里还没有任何 `decision=exclude` 的条目(比如你还没开始做裁剪决定),这两步都是空操作,不影响正常合并。
