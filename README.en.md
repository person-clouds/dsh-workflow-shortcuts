---
audience: shared
status: current
---

[中文](README.md) | [English](README.en.md)

# dsh-workflow-shortcuts

Workflow slash commands for DSH Web: `/D` discusses and writes a plan, `/G` starts a fresh session from a plan or free-form task, `/C` diagnoses and fixes issues in the current session, `/V` verifies changes (in place for a blank session, via a read-only subagent for a non-blank one), `/VP` reviews a plan document, and `/ok` clears the TODO prefix from a session title. The read-only and budget hard guard for `/V` and `/VP` requires `@fenghoer/dsh-context-guard` >= `0.5.0`; installing shortcuts alone gives prompt constraints only, not a real hard block, and a subagent dispatched from a non-blank session has no `V：` title either. Both verification skills are manual-only: they run only for `/V`, `/VP`, or an explicit verification request, never automatically; pre-commit self-checks stay with the implementing session.

## What matters most

- `/D [task]`: the current session only discusses, changes no files, renames itself to `D: <summary>`, and writes `PLAN-*.md` once the plan settles; the prompt routes bugfixes and production incidents to `/C`; images and files in the input box are submitted along with the discussion prompt.
- `/C [issue description | information received]`: diagnoses and fixes bugs or production incidents in the current session, renames it to `C：<summary>`, and creates no session; production/shared environments are diagnosed read-only, while restarts, data changes, permission changes, dependency installs and releases need explicit authorization; it never writes a plan document; images and files are forwarded. A read-only verification session (`V：…`) rejects `/C` so the title cannot be renamed to bypass the read-only guard.
- `/G [plan path | task]`: starts a separate session to implement; with empty input it finds a plan document in recent messages, and asks you to pick when several match; images are supported, while a file attachment is rejected (file receipts are scoped to the receiving session) — use a file path or `/D` instead.
- `/V [change note | snapshot sha]`: if the current session is blank (no messages), renames it to `V：…` and verifies read-only in place; if the session already has content, it does not rename or create a session — the main agent calls `subagent` to open a read-only verification child and summarizes the result here. By default it runs one verification session for one round, reports in at most 15 lines, and checks only the diff, acceptance commands and plan items, reporting without editing; a high-risk change may add one more session/round only when the dispatch prompt explicitly says `verify-again`, with the reason recorded; a failing report ends with a “需要你执行” section for the main session to act on; a blank session accepts images, while images in a non-blank session are rejected with a suggestion to open a blank session; file attachments are always rejected.
- `/VP [plan path | review focus]`: reviews goals, facts, executability, acceptance, counterexamples and safety; a blank session is renamed to `V：计划：…` in place, while a non-blank session dispatches a read-only plan-verification subagent and summarizes its result. Empty input finds plans in recent messages and asks you to pick; image and file rules match `/V`.
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
/G /home/zh/www/personalCloud/plans/doc/PLAN-foo.md
/C investigate the 502 on production
/V verify guard changes 快照：abc1234
/VP /home/zh/www/personalCloud/plans/doc/PLAN-foo.md
/ok
```

The install script, GitHub Release tarball and local link installs are documented in [`PUBLISHING.md`](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md).

## Features

Every command's prompt starts with an English role sentence: `/D` senior software architect, `/G` senior software development expert, `/C` senior software troubleshooting expert, `/V` senior software testing expert, `/VP` senior technical plan reviewer; in a non-blank session `/V` and `/VP` switch to a verification dispatcher that only opens the child session and summarizes.

1. **`/D` discussion**: sends a fixed 4-point prompt with a routing note before the numbered rules (“content exploration and planning only; use `/C` for bugfixes and production incidents”): read `PROJECT_INDEX`, discuss only without changing files, write the plan after confirmation, and self-check facts, counterexamples, safety and decidable acceptance with `plan-verify` before delivering the plan (mark unverified items “待验证”). The session is renamed to `D: <summary>` (`D: 新讨论` for empty input).
2. **`/G` plan mode**: input containing a `.md` path with directories, or a filename starting with `PLAN-`/`plan-`, is treated as a plan document; extra requirements may follow, e.g. `/G task/foo/PLAN-foo.md only backend plus tests`.
3. **`/G` text mode**: any other non-empty input becomes its own task session with the execution prompt.
4. **`/G` empty input**: searches the current session's recent user/assistant messages for readable `.md` plans; one match runs immediately, several open a picker, cancel or no match creates no session. The count comes from browser `localStorage` key `dsh-workflow-shortcuts.recentMessages` (default 5, range 1–50).
5. **Session titles**: in plan mode the new title uses the H1 from the plan's first 40 lines (H2 if no H1, code fences ignored); `PLAN`/`计划` prefixes and following separators are stripped, then prefixed with `G：<title>`; read failures fall back to the filename.
6. **TODO titles and `/ok`**: when an assistant message carries the hidden “需要你执行” marker, the Host listens on `session/event` and renames the session to `TODO：<title>` (`TODO <title>` when the title already starts with `/D`, `/G`, etc.); already-prefixed titles are idempotent and subagent messages are ignored. `/ok` removes one leading prefix without archiving, and reports “当前没有 TODO 标记” when there is none.
7. **`/V` implementation verification**: a blank session is renamed `V：<summary>` and receives the read-only verification prompt; a non-blank session is neither renamed nor replaced — the main agent gets a dispatch prompt (`subagent` + `description: V：核验改动`) that requires the child to follow the `change-verify` steps (by default one session for one round, at most 15 report lines, only the diff, acceptance commands and plan items, no whole-repo scanning), report only, keep the conclusion and issue list apart, and pass the conclusion back to the main session. A high-risk change may add one session/round only when the dispatch prompt says `verify-again`, and the reason must be recorded in the commit message. A `快照：<sha>` in the input is copied into the prompt so `dsh-context-guard` can deduplicate dispatches. For a blank session the verify budget (nudges/hard denials/output per turn) and the read-only restriction are enforced by `dsh-context-guard` from the `V：`/`TODO：V：` title; a child dispatched from a non-blank session has no such title, so read-only is prompt-constrained and this plugin repeats no numbers.
8. **`/VP` plan verification**: a blank session is renamed `V：计划：<plan title>` and receives the read-only plan-verification prompt; a non-blank session dispatches a child instead (`description: V：计划核验`). The prompt uses the bundled `plan-verify` skill to review goal alignment, facts, executability, decidable acceptance, counterexamples and safety. It carries **only the plan file path and the review focus** — it never pastes the plan body or the originating message excerpt, since plans are usually long and the paste both wastes tokens and duplicates the focus. An explicit `/VP [plan path | review focus]` argument must resolve to a plan path, otherwise it reports a usage error; empty input searches the current session's latest 5 user/assistant messages for readable `.md` plans (adjust with the `dsh-workflow-shortcuts.recentMessages` `localStorage` key), uses one match directly, opens a “选择要核验的计划文档” picker for several, sends no prompt on cancel, and errors on no match. The prompt carries **no `快照：<sha>` key that dispatch deduplication can match**; any snapshot text in the input is replaced with `快照：<已省略>`, so the same plan can be reviewed repeatedly without dispatch deduplication.
9. **Prompt extras**: by default reads `.dsh/workflow-shortcuts/discussion.md` (appended to `/D`), `execution.md` (appended to `/G`), `check.md` (appended to `/C`) and `verify.md` (appended to `/V` and `/VP`) from the session working directory; edit the files and the next input picks them up. `/D` and `/C` place the extra section before `任务：`; the others append it at the end.
10. **Bundled skills**: ships `skills/change-verify/SKILL.md` (moved from agent-skills, sole source) and `skills/plan-verify/SKILL.md`; on Host startup `lib/bundled-skills.js` parses their frontmatter and `ctx.inject(['skills'])` registers them with `source: 'bundled'` and `provider: 'dsh-workflow-shortcuts'`. A missing skills service or a missing single skill is skipped silently and never blocks plugin startup; `package.json` `files` already includes `skills`.
11. **Attachments**: `/D` and `/C` forward every input-box attachment as-is (images as bytes, files through the current session's upload receipt); `/G` keeps images only and sends them with the new session's first prompt, and a file attachment yields one clear error without creating a session; `/V` and `/VP` keep images only in a blank session, reject images in a non-blank session with a suggestion to open a blank one, and always reject file attachments — DSH resolves file receipts against the receiving session, so they cannot cross sessions; the error suggests `/D` or `/C` for files. Attachments and text follow the native composer order (attachments first, text last) and change neither session titles, prompt bodies, plan parsing nor workspace logic; `/ok` does not accept attachments.

## Configuration

The three spec paths and four extra-prompt files are all optional; empty values count as unset:

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
    checkPromptFile: .dsh/workflow-shortcuts/check.md
```

- `workflowDoc` / `planDoc` / `planTemplate`: only configured paths are listed in `/D` item 2; when all are empty `/D` just asks for “current workspace/repo conventions”.
- `discussionPromptFile` / `executionPromptFile` / `checkPromptFile` / `verifyPromptFile`: appended to `/D`, `/G`, `/C`, `/V` and `/VP` respectively; relative to the session working directory; `none`/`off`/`-` disables one. The first 200 lines are read on each submit, truncated with a note beyond 8000 characters.
- Config changes need a Host reload and page refresh; editing the extra-prompt files does not.

## Boundaries and limits

- Registers only a client-side `/` input source; no new public port, no new Host API (the Host only listens to `session/event` for titles and registers the bundled skills with the skills service).
- `/D` only sends the discussion prompt and changes no files; `/C` only renames the current session and sends its prompt, changing no files; `/G` only parses input, creates a session and builds a prompt, reading at most the plan's first 40 lines for a title, and checks candidate readability for empty `/G`; `/V` and `/VP` only parse input and build prompts — renaming a blank session or dispatching a child for a non-blank one — and never create a top-level session. For a blank session the read-only state is backed by `dsh-context-guard`; non-blank sessions and the dispatched child rely on prompt constraints only, so they are not a hard sandbox.
- The read-only and budget hard guard for a `V：` session requires `dsh-context-guard`; `/C` itself is prompt-constrained, but it refuses to run while the title is a `V：` verification title so renaming cannot escape the read-only state.
- **Must be installed together**: the read-only and budget hard guard for `/V` and `/VP` in a blank session requires `@fenghoer/dsh-context-guard` >= `0.5.0` and works from the `V：`/`TODO：V：` title. Installing shortcuts alone leaves prompt constraints only, with no real read-only or budget hard block; installing guard alone has no `/V` or `/VP` entry (manually renaming a session title to `V：` still enables it). A verification child dispatched from a non-blank session has no `V：` title, so both read-only and budget are prompt-constrained there.
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
