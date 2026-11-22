---
audience: shared
status: current
---

[中文](README.md) | [English](README.en.md)

# dsh-workflow-shortcuts

Workflow slash commands for DSH Web: `/D` discusses and writes a plan, `/G` starts a fresh session from a plan or free-form task, `/V` opens a read-only verification session, and `/ok` clears the TODO prefix from a session title.

## What matters most

- `/D [task]`: the current session only discusses, changes no files, renames itself to `D: <summary>`, and writes `PLAN-*.md` once the plan settles.
- `/G [plan path | task]`: starts a separate session to implement; with empty input it finds a plan document in recent messages, and asks you to pick when several match.
- `/V [change note | snapshot sha]`: starts a read-only verification session titled `V：…`; it checks behaviour only, caps itself at two rounds and reports without editing; a failing report ends with a “需要你执行” section for the main session to act on.
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
/ok
```

The install script, GitHub Release tarball and local link installs are documented in [`PUBLISHING.md`](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md).

## Features

1. **`/D` discussion**: sends a fixed 3-point prompt: read `PROJECT_INDEX`/`SPEC`, discuss only without changing files, write the plan after confirmation. The session is renamed to `D: <summary>` (`D: 新讨论` for empty input).
2. **`/G` plan mode**: input containing a `.md` path with directories, or a filename starting with `PLAN-`/`plan-`, is treated as a plan document; extra requirements may follow, e.g. `/G task/foo/PLAN-foo.md only backend plus tests`.
3. **`/G` text mode**: any other non-empty input becomes its own task session with the execution prompt.
4. **`/G` empty input**: searches the current session's recent user/assistant messages for readable `.md` plans; one match runs immediately, several open a picker, cancel or no match creates no session. The count comes from browser `localStorage` key `dsh-workflow-shortcuts.recentMessages` (default 5, range 1–50).
5. **Session titles**: in plan mode the new title uses the H1 from the plan's first 40 lines (H2 if no H1, code fences ignored); `PLAN`/`计划` prefixes and following separators are stripped, then prefixed with `G：<title>`; read failures fall back to the filename.
6. **TODO titles and `/ok`**: when an assistant message carries the hidden “需要你执行” marker, the Host listens on `session/event` and renames the session to `TODO：<title>` (`TODO <title>` when the title already starts with `/D`, `/G`, etc.); already-prefixed titles are idempotent and subagent messages are ignored. `/ok` removes one leading prefix without archiving, and reports “当前没有 TODO 标记” when there is none.
7. **`/V` verification**: creates a session renamed `V：<summary>` and sends a read-only verification prompt — follow the `change-verify` steps, at most two rounds, report only, conclusion and issue list kept apart. A `快照：<sha>` in the input is copied into the prompt so `dsh-context-guard` can deduplicate dispatches. The verify budget (nudges/hard denials/output per turn) and the read-only restriction are enforced by `dsh-context-guard` from the `V：`/`TODO：V：` title; this plugin repeats no numbers.
8. **Prompt extras**: by default reads `.dsh/workflow-shortcuts/discussion.md` (appended to `/D`), `execution.md` (appended to `/G`) and `verify.md` (appended to `/V`) from the session working directory; edit the files and the next input picks them up.

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

- Registers only a client-side `/` input source; no new public port, no new Host API (since 0.3.0 the Host only listens to `session/event` for titles).
- `/D` only sends the discussion prompt and changes no files; `/G` and `/V` only parse input and build a prompt, reading at most the plan's first 40 lines for a title, and checks candidate readability for empty `/G`. `/V` read-only is backed by `dsh-context-guard`, not by the prompt alone.
- Reads no credentials, accesses no network resources, injects no HTML.
- Sessions depend on the DSH Client services `inputTriggers`, `sessions`, `workspaces`, `uiWorkspace`, and `remote.workspaceFiles`; DSH upgrades may require adaptation.

## Where to look

- Status and verification commands: [STATUS.md](/home/zh/www/dsh-workflow-shortcuts/STATUS.md)
- Goals, scope and interfaces: [SPEC.md](/home/zh/www/dsh-workflow-shortcuts/SPEC.md)
- Publishing and the marketplace PR: [PUBLISHING.md](/home/zh/www/dsh-workflow-shortcuts/PUBLISHING.md)
- Market entry: [market/person-clouds__dsh-workflow-shortcuts.yml](/home/zh/www/dsh-workflow-shortcuts/market/person-clouds__dsh-workflow-shortcuts.yml)
- License: [MIT](LICENSE)
