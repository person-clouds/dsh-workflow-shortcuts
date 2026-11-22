---
audience: shared
status: current
---

[中文](README.md) | [English](README.en.md)

# dsh-workflow-shortcuts

Workflow slash commands for DSH Web: `/D` discusses and writes a plan, `/G` starts a fresh session from a plan or free-form task, `/V` opens a read-only verification session, `/VP` opens a read-only plan-verification session, and `/ok` clears the TODO prefix from a session title. The read-only and budget hard guard for `/V` and `/VP` requires `@fenghoer/dsh-context-guard` >= `0.5.0`; installing shortcuts alone gives prompt constraints only, not a real hard block. Both verification skills are manual-only: they run only for `/V`, `/VP`, or an explicit verification request, never automatically; pre-commit self-checks stay with the implementing session.

## What matters most

- `/D [task]`: the current session only discusses, changes no files, renames itself to `D: <summary>`, and writes `PLAN-*.md` once the plan settles; images and files in the input box are submitted along with the discussion prompt.
- `/G [plan path | task]`: starts a separate session to implement; with empty input it finds a plan document in recent messages, and asks you to pick when several match; images are supported, while a file attachment is rejected (file receipts are scoped to the receiving session) — use a file path or `/D` instead.
- `/V [change note | snapshot sha]`: starts a read-only verification session titled `V：…`; it checks behaviour only, caps itself at two rounds and reports without editing; a failing report ends with a “需要你执行” section for the main session to act on; images are supported, file attachments are rejected.
- `/VP [plan path | review focus]`: starts a read-only plan-verification session titled `V：计划：…`; it reviews goals, facts, executability, acceptance, counterexamples and safety; empty input finds plans in recent messages and asks you to pick; images are supported, file attachments are rejected.
- `/ok`: removes one leading `TODO` prefix from the current session title; it never touches content or archives the session.
- When an assistant reply ends with a “需要你执行” section, the Host marks the session title as `TODO：<title>` so unfinished sessions are easy to find.
- DSH Web client only; terminals and the API keep using plain prompts.

## Quick start

```bash
dsh plugin --profile web add dsh-workflow-shortcuts
```

Restart `dsh web` or refresh the page, then use them in the input box:

```text
/D clarify the requirement first
/G /home/zh/www/doc/plans/PLAN-foo.md
/V verify guard changes 快照：abc1234
/VP /home/zh/www/doc/plans/PLAN-foo.md
/ok
```

The install script, GitHub Release tarball and local link installs are documented in [`PUBLISHING.md`](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md).

## Features

1. **`/D` discussion**: sends a fixed 4-point prompt: read `PROJECT_INDEX`, discuss only without changing files, write the plan after confirmation, and self-check facts, counterexamples, safety and decidable acceptance with `plan-verify` before delivering the plan (mark unverified items “待验证”). The session is renamed to `D: <summary>` (`D: 新讨论` for empty input).
2. **`/G` plan mode**: input containing a `.md` path with directories, or a filename starting with `PLAN-`/`plan-`, is treated as a plan document; extra requirements may follow, e.g. `/G task/foo/PLAN-foo.md only backend plus tests`.
3. **`/G` text mode**: any other non-empty input becomes its own task session with the execution prompt.
4. **`/G` empty input**: searches the current session's recent user/assistant messages for readable `.md` plans; one match runs immediately, several open a picker, cancel or no match creates no session. The count comes from browser `localStorage` key `dsh-workflow-shortcuts.recentMessages` (default 5, range 1–50).
5. **Session titles**: in plan mode the new title uses the H1 from the plan's first 40 lines (H2 if no H1, code fences ignored); `PLAN`/`计划` prefixes and following separators are stripped, then prefixed with `G：<title>`; read failures fall back to the filename.
6. **TODO titles and `/ok`**: when an assistant message carries the hidden “需要你执行” marker, the Host listens on `session/event` and renames the session to `TODO：<title>` (`TODO <title>` when the title already starts with `/D`, `/G`, etc.); already-prefixed titles are idempotent and subagent messages are ignored. `/ok` removes one leading prefix without archiving, and reports “当前没有 TODO 标记” when there is none.
7. **`/V` implementation verification**: creates a session renamed `V：<summary>` and sends a read-only verification prompt — follow the `change-verify` steps, at most two rounds, report only, conclusion and issue list kept apart. A `快照：<sha>` in the input is copied into the prompt so `dsh-context-guard` can deduplicate dispatches. The verify budget (nudges/hard denials/output per turn) and the read-only restriction are enforced by `dsh-context-guard` from the `V：`/`TODO：V：` title; this plugin repeats no numbers.
8. **`/VP` plan verification**: creates a session renamed `V：计划：<plan title>` and sends a read-only plan-verification prompt that uses the bundled `plan-verify` skill to review goal alignment, facts, executability, decidable acceptance, counterexamples and safety. The prompt carries **only the plan file path and the review focus** — it never pastes the plan body or the originating message excerpt, since plans are usually long and the paste both wastes tokens and duplicates the focus. An explicit `/VP [plan path | review focus]` argument must resolve to a plan path, otherwise it reports a usage error; empty input searches the current session's latest 5 user/assistant messages for readable `.md` plans (adjust with the `dsh-workflow-shortcuts.recentMessages` `localStorage` key), uses one match directly, opens a “选择要核验的计划文档” picker for several, creates no session on cancel, and errors on no match. The prompt carries **no `快照：<sha>` key that dispatch deduplication can match**; any snapshot text in the input is replaced with `快照：<已省略>`, so the same plan can be reviewed repeatedly without dispatch deduplication.
9. **Prompt extras**: by default reads `.dsh/workflow-shortcuts/discussion.md` (appended to `/D`), `execution.md` (appended to `/G`) and `verify.md` (appended to `/V` and `/VP`) from the session working directory; edit the files and the next input picks them up.
10. **Bundled skills**: ships `skills/change-verify/SKILL.md` (moved from agent-skills, sole source) and `skills/plan-verify/SKILL.md`; on Host startup `lib/bundled-skills.js` parses their frontmatter and `ctx.inject(['skills'])` registers them with `source: 'bundled'` and `provider: 'dsh-workflow-shortcuts'`. A missing skills service or a missing single skill is skipped silently and never blocks plugin startup; `package.json` `files` already includes `skills`.
11. **Attachments**: `/D` forwards every input-box attachment as-is (images as bytes, files through the current session's upload receipt); `/G`, `/V` and `/VP` keep images only and send them with the new session's first prompt, and a file attachment yields one clear error without creating a session — DSH resolves file receipts against the receiving session, so they cannot cross sessions. Attachments and text follow the native composer order (attachments first, text last) and change neither session titles, prompt bodies, plan parsing nor workspace logic; `/ok` does not accept attachments.

## Configuration

The three spec paths and three extra-prompt files are all optional; empty values count as unset:

```yaml
- id: dsh-workflow-shortcuts
  name: dsh-workflow-shortcuts
  config:
    workflowDoc: /home/zh/www/doc/specs/task-workflow.md
    planDoc: /home/zh/www/doc/specs/documentation-rules.md
    planTemplate: ""
    discussionPromptFile: .dsh/workflow-shortcuts/discussion.md
    executionPromptFile: .dsh/workflow-shortcuts/execution.md
    verifyPromptFile: .dsh/workflow-shortcuts/verify.md
```

- `workflowDoc` / `planDoc` / `planTemplate`: only configured paths are listed in `/D` item 2; when all are empty `/D` just asks for “current workspace/repo conventions”.
- `discussionPromptFile` / `executionPromptFile` / `verifyPromptFile`: relative to the session working directory; `none`/`off`/`-` disables one. The first 200 lines are read on each submit, truncated with a note beyond 8000 characters.
- Config changes need a Host reload and page refresh; editing the extra-prompt files does not.

## Boundaries and limits

- Registers only a client-side `/` input source; no new public port, no new Host API (the Host only listens to `session/event` for titles and registers the bundled skills with the skills service).
- `/D` only sends the discussion prompt and changes no files; `/G`, `/V` and `/VP` only parse input and build a prompt, reading at most the plan's first 40 lines for a title, and check candidate readability for empty `/G` and `/VP`. `/V` and `/VP` read-only is backed by `dsh-context-guard`, not by the prompt alone.
- **Must be installed together**: the read-only and budget hard guard for `/V` and `/VP` requires `@fenghoer/dsh-context-guard` >= `0.5.0` and works from the `V：`/`TODO：V：` title. Installing shortcuts alone leaves prompt constraints only, with no real read-only or budget hard block; installing guard alone has no `/V` or `/VP` entry (manually renaming a session title to `V：` still enables it).
- `/VP` only reviews the plan text and the facts it cites; it does not run the plan's acceptance commands and cannot find runtime defects that only surface during implementation. The same plan may be reviewed repeatedly, and repeated reviews consume verification budget.
- Skill name precedence: project `.dsh/skills` (rank 100) > plugin runtime registration (250) > user `~/.dsh/skills` (400); the plugin copy overrides an old copy in the user directory. Runtime registration is a startup snapshot, so editing `SKILL.md` requires restarting `dsh web` (unlike filesystem skill hot reload).
- Reads no credentials, accesses no network resources, injects no HTML.
- Sessions depend on the DSH Client services `inputTriggers`, `sessions`, `workspaces`, `uiWorkspace`, and `remote.workspaceFiles`; DSH upgrades may require adaptation.

## Where to look

- Status and verification commands: [STATUS.md](/home/zh/www/dsh-workflow-shortcuts/STATUS.md)
- Goals, scope and interfaces: [SPEC.md](/home/zh/www/dsh-workflow-shortcuts/SPEC.md)
- Publishing and the marketplace PR: [PUBLISHING.md](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md)
- Market entry: [market/person-clouds__dsh-workflow-shortcuts.yml](/home/zh/www/dsh-workflow-shortcuts/market/person-clouds__dsh-workflow-shortcuts.yml)
- License: [MIT](LICENSE)
