---
audience: shared
status: current
---

# dsh-workflow-shortcuts

[中文](README.md) | [English](README.en.md)

Slash commands for DSH Web that support a "discuss first, write a plan, then implement in a fresh session" workflow.

- `/D [task]`: enter discussion mode in the current session without modifying files; rename the session to `D: <task summary>`, then write the agreed solution to a `PLAN-*.md` document after the requirements settle.
- `/G [plan path | task text]`: create a fresh session that works from a plan document or from free-form task text; leave it empty to find a recent plan automatically.

The goal is to separate requirement discussion from code implementation so the implementation session does not carry the whole discussion history, reducing long-context usage.

## Commands

| Command | Description |
| --- | --- |
| `/D [task]` | Enter discussion mode in the current session, renaming it to `D: <task summary>`. No files are modified; after discussion converges, write the solution to `PLAN-*.md`. |
| `/G <plan path>` | Create a new session in the current workspace titled `G：<plan document title>` and start implementing from the plan. |
| `/G <task text>` | Create a new session titled `G：<task summary>` and start working from the supplied text. |
| `/G` | With no argument, search the latest N user/assistant messages for a `.md` plan: run the only match directly, show a picker for multiple matches, and create no session on cancel or no match. |

The plan path for `/G` may be absolute or relative to the current session working directory. Bare paths, quoted/backticked paths, and Markdown links are supported. Only `.md` plan files are accepted; `http(s)` links are rejected.

`/D` sends three short points: read `PROJECT_INDEX` and `SPEC`, and for content exploration (not a routine bugfix) discuss without changing code; after the approach is confirmed write `PLAN-*.md` following the optional Host-configured spec documents (or the current workspace/repo conventions when unconfigured); keep the plan short and executable, fix localized bugs directly with a note, and keep README/STATUS/PROJECT_INDEX up to date.

Plan mode is selected when the input contains a `.md` path with a directory component, or a file name starting with `PLAN-`/`plan-`; any other non-empty input is treated as task text. Extra requirements may follow a plan path, e.g. `/G task/foo/PLAN-foo.md only touch the backend and add tests`.

## Prompt overlays

The built-in prompts stay unchanged, but each submit can append your own requirements. Two files are read from the current session working directory by default:

| File | Purpose |
| --- | --- |
| `.dsh/workflow-shortcuts/discussion.md` | Appended to the `/D` discussion prompt |
| `.dsh/workflow-shortcuts/execution.md` | Appended to the `/G` execution prompt (plan and text modes) |

Edit the file and the next `/D` or `/G` picks it up; no DSH restart or page refresh is needed. Missing, unreadable, or blank files are skipped silently. Only the first 200 lines are read, and content over 8000 characters is truncated with a note. The content is appended as an "附加要求：" (extra requirements) block: before `任务：` for `/D`, and at the end for `/G`.

Change the paths through Host config; relative paths resolve against the current session working directory:

```yaml
- id: dsh-workflow-shortcuts
  name: dsh-workflow-shortcuts
  config:
    discussionPromptFile: /home/zh/www/prompts/discussion.md
    executionPromptFile: .dsh/workflow-shortcuts/execution.md
```

Defaults are `.dsh/workflow-shortcuts/discussion.md` and `.dsh/workflow-shortcuts/execution.md`; set a value to `none` (or `off`, `-`) to disable that overlay. Config changes still require reloading the Host configuration and refreshing the page, while file contents are read on every submit.

## `/D` spec document configuration

`/D` no longer hardcodes plan location, frontmatter, H1, or `## 改动记录` rules. On submit it reads configuration injected by the DSH Host. All three fields are optional absolute paths; empty, whitespace-only, or non-string values are treated as unconfigured:

```yaml
- id: dsh-workflow-shortcuts
  name: dsh-workflow-shortcuts
  config:
    workflowDoc: /home/zh/www/doc/specs/task-workflow.md
    planDoc: /home/zh/www/doc/specs/documentation-rules.md
    planTemplate: ""
```

- `workflowDoc`: workflow/authorization rules;
- `planDoc`: plan document rules;
- `planTemplate`: plan template.

Only configured entries are listed in `/D` point 2. When all three are unconfigured, the prompt only says "按当前工作区/仓库既有规范写 PLAN-*.md。". After changing config, reload the Host configuration and refresh the page; the Client reads the current value on every `/D` submit and does not cache it. This affects only future `/D` prompts, not existing sessions or `/G`.

For an empty `/G`, configure the search depth in browser `localStorage`: key `dsh-workflow-shortcuts.recentMessages`, default `5`, valid range `1–50`, invalid values fall back to `5`. Only `user/message` and `assistant/message` entries are scanned, newest first.

In plan mode, the session title is read from the first 40 lines of the plan document: the first H1 wins, otherwise the first H2; headings inside code fences are ignored. A leading `PLAN` / `计划` prefix (case-insensitive) and any following run of separators (whitespace, `：`, `:`, `、`, `·`, `｜`, `|`, `—`, `–`, `-`, `_`) are removed; ordinary words such as `Planning` are left untouched. If the read fails, no heading exists, or the cleaned title is empty, the plan file name is used instead and session creation continues.

## Installation

Install from npm:

```bash
dsh plugin --profile web add dsh-workflow-shortcuts
```

Or install the prebuilt tarball from GitHub Releases:

```bash
dsh plugin --profile web add https://github.com/person-clouds/dsh-workflow-shortcuts/releases/latest/download/dsh-workflow-shortcuts.tgz
```

For local development, install from a linked source directory:

```bash
dsh plugin --profile web add link:/path/to/dsh-workflow-shortcuts
```

Restart `dsh-web.service` and refresh the page. This plugin contains client-side code only, so a page refresh is usually enough.

If the current AI sandbox has read-only access to `~/.dsh`, run the installer on the host:

```bash
bash dsh-workflow-shortcuts/scripts/apply-profile.sh web
```

The script creates a local symlink, registers the `package.json` dependency, backs up and updates `cordis.patch.yml`, and restarts `dsh-web.service` when present.

## Usage

1. Type `/D` in the current session, choose "discuss", enter a task description, and press Enter.
2. The agent discusses and clarifies first (read-only, confirming the target repo and write permission). Once the approach is confirmed, it writes a plan document per the plan rules and returns a Markdown link whose display text is relative to the workspace root and whose URL is the absolute full path, for example `[personalCloud/task/foo/PLAN-foo.md](/home/zh/www/personalCloud/task/foo/PLAN-foo.md)`.
3. Type `/G <plan path>` or `/G <task text>`. The plugin creates a new session, renames it, and sends the matching execution prompt.

`/G` uses the current session working directory as the new session workspace and registers that workspace automatically when needed. The execution prompt has three short points: read the workspace `AGENTS.md` first; in plan mode execute the plan document directly, and in text mode work from `任务：`; then verify and wrap up under `AGENTS.md`.

## Security boundaries

- Registers only a client-side `/` input source. It adds no public port and no host API.
- `/D` sends a discussion prompt. The agent first investigates read-only and confirms the target repo/write permission; no files change before the approach is confirmed. Simple, well-localized changes may be implemented directly, with README, STATUS, PROJECT_INDEX (when present), and related docs updated. Complex changes still require a plan and user confirmation.
- `/G` only parses the input and builds a prompt. In plan mode it reads the first 40 lines of the plan document solely to build the title and falls back to the file name when the read fails. An empty `/G` checks candidate readability via `remote.workspaceFiles.read` but does not validate plan content.
- It does not read credentials, access network resources, or inject HTML.

## Limitations

- `/D` and `/G` work only in the DSH Web client. Terminal/API sessions still use normal prompts or host commands.
- `/G` reuses the current session workspace and registers it automatically when needed.
- Text mode uses only the text after `/G`; it does not carry over the current session discussion history.
- The plugin depends on the DSH client services `inputTriggers`, `sessions`, `workspaces`, `uiWorkspace`, and `remote.workspaceFiles`; DSH upgrades that change these interfaces require an adapter update.

## Development and tests

```bash
npm test
node -e "new (require('vm').Script)(require('fs').readFileSync('client.js','utf8'))"
npm pack --dry-run
```

Tests use Node's built-in `node:test` and `vm`; Client tests require neither a browser nor external services, while Host tests use a minimal schema stub to verify config defaults, sanitization, and global injection.

## Publishing

See [PUBLISHING.md](PUBLISHING.md). The marketplace entry draft is at [market/person-clouds__dsh-workflow-shortcuts.yml](market/person-clouds__dsh-workflow-shortcuts.yml).

## License

[MIT](LICENSE)
