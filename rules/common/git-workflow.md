# Git Workflow

## Commit Message Format
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

> **Project note**: This is the default when the project has no established convention of its own. If the project's own CLAUDE.md, an active skill's instructions, or the existing `git log` history already show a different format (e.g. a required ticket-ID prefix), follow that instead.

Note: To disable co-author attribution on commits, set `"includeCoAuthoredBy": false` in `~/.claude/settings.json` (Claude Code appends `Co-Authored-By` by default; ECC does not ship this setting).

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch

> For the full development process (planning, TDD, code review) before git operations,
> see [development-workflow.md](./development-workflow.md).
