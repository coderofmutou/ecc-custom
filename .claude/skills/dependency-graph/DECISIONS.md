# 决策台账(decisions.json)

记录"这个组件的源文件该不该留在 fork 里",驱动 `decision-ledger.js prune` 对仓库做真实裁剪。跟仓库里另外两份看起来相似的文件是不同的东西,请勿混淆:

| 文件 | 记录的是什么 | 谁在用 |
|---|---|---|
| `overrides.json` | 依赖图的边画得对不对(误报抑制/补充漏检) | `relationship-graph.js` |
| `CATEGORIES.md` | 561 个组件按**功能主题/使用场景**的分类参考,一次性分析产物,不含任何保留/排除判断 | 人工参考,不被脚本读取 |
| `data/decisions.json`(本文件描述的对象) | 每个组件是否要**真的从仓库删掉**的最终决策,以及为什么 | `decision-ledger.js` |

## 字段说明

`decisions.json` 里的每条记录分两条**完全平行、互不回退**的线,不要混:

- **`decision`/`reason`/`decidedAt`/`hardDependents`**——你**真正做出的决定**,以及你自己的理由。只有 `decision` 会被 `prune` 读取来真删文件。默认值是 `pending`、`reason` 默认是空,只有你自己跑过 `record <id> include|exclude --reason "..."` 之后才会填上。
- **`suggestedDecision`/`suggestedReason`/`suggestedAt`**——从外部数据源(比如 `~/.claude/plugin-overlay/catalog.json`/`pending.json`)批量导入的**建议**和**建议的理由**,纯参考,`prune` 不会读它们。这些建议本身可能有问题——导入这批数据时就发现 catalog.json 的 `recommendation` 字段和它自己的 `reason` 字段有几十处自相矛盾(比如某条写着"用户会主动调用此工作流",`recommendation` 却是 `disable`),不能直接当决定用。

**两条线不会互相回退**:`record` 只读写 `reason`,从不读 `suggestedReason`——就算你 `record <id> exclude` 时不传 `--reason`,`reason` 也只会保持你自己上次填的值(或者留空),绝不会偷偷继承 `suggestedReason` 的内容。这是有意的:`suggestedReason` 可能是错的(见上一条),不该在你没过一眼的情况下被当成"你的决定理由"混进去。

```json
{
  "version": 1,
  "entries": [
    {
      "id": "skill:some-skill",
      "decision": "pending",
      "suggestedDecision": "exclude",
      "suggestedReason": "与 Java 后端画像无关,plugin-overlay 的 catalog.json 标记为 disable",
      "suggestedAt": "2026-07-10",
      "hardDependents": [
        { "id": "skill:other-skill", "note": "第 3 步硬编码调用 skill:some-skill,裁剪时要同步改这段文字" }
      ]
    }
  ]
}
```

上面这条还是 `pending`,所以没有 `reason`/`decidedAt`——一旦你跑 `record skill:some-skill exclude --reason "..."`,才会补上这两个字段,`suggestedDecision`/`suggestedReason`/`suggestedAt` 三个字段原样保留(不会被覆盖或删除),留作"当初的建议是什么"的历史记录。

- `decision`:`include`(保留)/`exclude`(裁剪)/`pending`(还没决定,`prune` 会忽略它,不会误删)。**这才是执行依据。**
- `reason`:**你自己的**决定理由,只在你 `record` 过之后才存在。给未来的自己看的,不是给脚本用的。
- `suggestedDecision`/`suggestedReason`(可选):外部建议及其理由,只在你还没做决定(`decision=pending`)时有参考价值。`list` 命令会把它们显示出来(`(建议:exclude)` + `建议理由:...`),但不会自动采纳,也不会自动搬进 `reason`。
- `decidedAt`:真正决定的日期,只在 `decision` 不是 `pending` 时才有意义。不传 `--decided-at` 时默认取系统当天。
- `hardDependents`(可选,只在 `decision=exclude` 时有意义):`record` 会自动打印 `dependents <id>` 的结果,但**判断是不是强依赖需要人工看**——不是"随便被提到"那种描述性引用,而是"删了会导致这个依赖方的核心逻辑失效"才算。判断为强依赖后,应该在裁剪那次改动里顺手把依赖方文件里的这句引用文字改掉或删掉(小范围手动编辑,`decision-ledger.js` 不自动改写这段文字——正则替换太脆弱,上游改了措辞后会悄悄失效)。

## 如何把建议变成决定

`suggestedDecision` 只是候选,想真正裁剪某个组件,必须显式 `record`:

```bash
node .claude/skills/dependency-graph/scripts/decision-ledger.js list --decision pending
# 看到 skill:xxx (建议:exclude) 之后,自己判断认可,再显式确认:
node .claude/skills/dependency-graph/scripts/decision-ledger.js record skill:xxx exclude --reason "..."
```

批量确认(比如认可某个主题下所有建议)目前没有专门的一键命令——故意不做,因为上面已经证明外部建议数据本身可能有错,批量无脑接受风险比逐条确认更大。



## 常用操作

```bash
# 记录一条排除决策(会自动列出谁依赖它,供人工判断 hardDependents)
node .claude/skills/dependency-graph/scripts/decision-ledger.js record skill:xxx exclude --reason "..."

# 看当前所有排除决策
node .claude/skills/dependency-graph/scripts/decision-ledger.js list --decision exclude

# 先看会删哪些文件(dry-run,默认行为)
node .claude/skills/dependency-graph/scripts/decision-ledger.js prune

# 确认无误后真正执行裁剪
node .claude/skills/dependency-graph/scripts/decision-ledger.js prune --apply

# 上游同步之后,看看有没有新组件需要分类、有没有决策指向已经不存在的 id
node .claude/skills/dependency-graph/scripts/decision-ledger.js diff-upstream
```

## 裁剪之后不要自作主张做的事

`prune --apply` 的职责边界到此为止:组件文件本身,加上 `manifests/install-modules.json` 里"整个 module 全部路径都死了"这种安全情况(自动删整块)。**module 里只要还混着存活路径,`prune` 只会报告死路径,绝不自动改这个共享数组**——见上面"常用操作"里 `prune`/`prune --apply` 的输出,死路径清单会单独列在"manifests/install-modules.json 里发现死路径"这一节下面。

裁剪完之后,**不要**因为想让 `npm test` 通过、或者想让 README.md/AGENTS.md/`.claude-plugin/plugin.json`/`.claude-plugin/marketplace.json`/`docs/COMMAND-REGISTRY.json` 里的组件计数看起来准确,就顺手跑:

```bash
node scripts/ci/catalog.js --write
node scripts/ci/generate-command-registry.js --write
```

这两个脚本在 `scripts/ci/` 下,不属于 `dependency-graph` 技能(本技能只读复用它们导出的函数,从不执行 `--write`,见 [SKILL.md](SKILL.md) 里"两者本身都未被修改"的说明)。它们会去改一批 upstream 也在高频维护的共享文件——同一行改同一个数字/同一份命令列表——upstream 只要恰好也改到同一处,就会给未来的合并制造冲突点,而且这类改动没有任何自动化冲突消解机制兜底,出了冲突要人工判断。要不要同步这些计数、什么时候同步(比如真的要发布/给别人用这个 fork 之前),是用户自己的决定,裁剪流程不要替用户做这个决定——哪怕不跑会导致 `npm test` 失败也不例外。

**但下面这一步不是"要不要做"的选择题,几乎必做**:`prune --apply` 整块删除一个 module 之后,如果 `manifests/install-components.json` 的 `components[].modules` 或 `manifests/install-profiles.json` 的 `profiles[].modules` 里还有条目引用这个刚被删掉的 module id,`scripts/ci/validate-install-manifests.js`(在 `npm test` 里跑)会报 `ERROR: Component ... references unknown module ...` / `ERROR: full profile is missing module ...`,直接导致 `npm test` 失败。`prune --apply` 目前**不会**级联清理这两个文件——单纯是为了控制这次改动的范围,没有做,需要手动去这两个文件里摘掉对应的 module id。

## 已知局限

- `hook:` 类型的组件不支持 `prune --apply` 自动裁剪——hook 定义共享在 `hooks/hooks.json` 一个数组里,不是独立文件,自动删除容易误伤同文件里其他 hook 的定义。`prune` 会把它们列在"需手动"里,自己去 `hooks/hooks.json` 里删对应条目。
- `prune` 只会真删除 `decision=exclude` 且能在依赖图里查到路径的条目;查不到路径(可能已经被删过,或者上游改名了)会被跳过并提示,不会报错中断。

## 如何恢复一个已裁剪的组件

裁剪不建单独的归档目录,恢复靠 git 本身:

```bash
git log --follow -- skills/some-skill/SKILL.md   # 找到删除前最后一次存在的提交
git checkout <那个提交>^ -- skills/some-skill      # 恢复整个目录
```

同时记得把 `decisions.json` 里对应条目的 `decision` 改回 `include`,否则下次跑 `prune --apply` 又会把它删掉。

## 和上游同步的关系

`upstream-sync` 技能的 `sync-upstream.js` 在合并 `upstream/main` 后,会无条件重跑一次等价于 `decision-ledger.js prune --apply` 效果的裁剪逻辑——注意这是直接调用本文件描述的 `buildPrunePlan`/`applyPrunePlan` 导出函数,不是起子进程跑 CLI(详见 [upstream-sync/SKILL.md](../upstream-sync/SKILL.md))。这是为了处理"上游新增了本该属于已裁剪目录、但因为是全新文件不会触发合并冲突"的情况。同步前后建议各跑一次 `diff-upstream`,确认没有新增组件遗漏分类、没有决策指向已经改名/消失的 id。
