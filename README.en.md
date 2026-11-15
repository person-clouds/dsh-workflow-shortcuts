# dsh-workflow-shortcuts

[中文](README.md) | [English](README.en.md)

Slash commands for DSH Web that support a "discuss first, write a plan, then implement in a fresh session" workflow.

- `/D [task]`: enter discussion mode in the current session without modifying files; after the requirements settle, write the agreed solution to a `PLAN-*.md` document.
- `/G <plan path | task text>`: create a fresh session that works from a plan document or from free-form task text.

The goal is to separate requirement discussion from code implementation so the implementation session does not carry the whole discussion history, reducing long-context usage.

## Commands

| Command | Description |
| --- | --- |
| `/D [task]` | Enter discussion mode in the current session. No files are modified; after discussion converges, write the solution to `PLAN-*.md`. |
| `/G <plan path>` | Create a new session in the current workspace titled `实施：<plan file name>` and start implementing from the plan. |
| `/G <task text>` | Create a new session titled `任务：<task summary>` and start working from the supplied text. |

The plan path for `/G` may be absolute or relative to the current session working directory.

Plan mode is selected when the input contains a `.md`/`.markdown` path with a directory component, or a file name starting with `PLAN-`/`plan-`; any other non-empty input is treated as task text. Extra requirements may follow a plan path, e.g. `/G task/foo/PLAN-foo.md only touch the backend and add tests`.

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
bash task/dsh-workflow-shortcuts/scripts/apply-profile.sh web
```

The script creates a local symlink, registers the `package.json` dependency, backs up and updates `cordis.patch.yml`, and restarts `dsh-web.service` when present.

## Usage

1. Type `/D` in the current session, choose "discuss", enter a task description, and press Enter.
2. The agent enters discussion mode. Once requirements converge, it writes a plan document and returns its absolute path.
3. Type `/G <plan path>` or `/G <task text>`. The plugin creates a new session, renames it, and sends the matching execution prompt.

`/G` uses the current session working directory as the new session workspace and registers that workspace automatically when needed. Both modes instruct the new session to read the code and workspace rules first, keep changes minimal, run verification, and commit according to repository rules.

## Security boundaries

- Registers only a client-side `/` input source. It adds no public port and no host API.
- `/D` only sends a discussion prompt; it does not modify files directly. Writing the plan document is performed by the agent following the prompt.
- `/G` only parses the input and builds a prompt; it does not verify that the plan file exists. A missing path is reported by the implementation agent in the new session.
- It does not read credentials, access network resources, or inject HTML.

## Limitations

- `/D` and `/G` work only in the DSH Web client. Terminal/API sessions still use normal prompts or host commands.
- `/G` reuses the current session workspace and registers it automatically when needed.
- Text mode uses only the text after `/G`; it does not carry over the current session discussion history.
- The plugin depends on the DSH client services `inputTriggers`, `sessions`, `workspaces`, and `uiWorkspace`; DSH upgrades that change these interfaces require an adapter update.

## Development and tests

```bash
npm test
node -e "new (require('vm').Script)(require('fs').readFileSync('client.js','utf8'))"
npm pack --dry-run
```

Tests use Node's built-in `node:test` and `vm`; they require neither a browser nor external services and cover plan mode, text mode, and argument errors.

## Publishing

See [PUBLISHING.md](PUBLISHING.md). The marketplace entry draft is at [market/person-clouds__dsh-workflow-shortcuts.yml](market/person-clouds__dsh-workflow-shortcuts.yml).

## License

[MIT](LICENSE)
