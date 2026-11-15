# dsh-workflow-shortcuts

[中文](README.md) | [English](README.en.md)

Slash commands for DSH Web that support a "discuss first, write a plan, then implement in a fresh session" workflow.

- `/D [task]`: enter discussion mode in the current session without modifying files; after the requirements settle, write the agreed solution to a `PLAN-*.md` document.
- `/G <plan path>`: create a new implementation session from that plan document and send it the plan path plus implementation requirements.

The goal is to separate requirement discussion from code implementation so the implementation session does not carry the whole discussion history, reducing long-context usage.

## Commands

| Command | Description |
| --- | --- |
| `/D [task]` | Enter discussion mode in the current session. No files are modified; after discussion converges, write the solution to `PLAN-*.md`. |
| `/G <plan path>` | Create a new session in the current workspace titled `实施：<plan file name>`, then send it the plan path to start implementation. |

The plan path for `/G` may be absolute or relative to the current session working directory.

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
3. Start a new session or type `/G <plan path>`. The plugin creates a new session, renames it, and sends the implementation prompt.

`/G` uses the current session working directory as the new session workspace and registers that workspace automatically when needed.

## Security boundaries

- Registers only a client-side `/` input source. It adds no public port and no host API.
- `/D` only sends a discussion prompt; it does not modify files directly. Writing the plan document is performed by the agent following the prompt.
- `/G` parses the path but does not verify that the file exists; a missing path is reported by the implementation agent in the new session.
- It does not read credentials, access network resources, or inject HTML.

## Limitations

- `/D` and `/G` work only in the DSH Web client. Terminal/API sessions still use normal prompts or host commands.
- `/G` reuses the current session workspace and registers it automatically when needed.
- The plugin depends on the DSH client services `inputTriggers`, `sessions`, `workspaces`, and `uiWorkspace`; DSH upgrades that change these interfaces require an adapter update.

## Development and tests

```bash
npm test
node -e "new (require('vm').Script)(require('fs').readFileSync('client.js','utf8'))"
npm pack --dry-run
```

Tests use Node's built-in `node:test` and `vm`; they require neither a browser nor external services.

## Publishing

See [PUBLISHING.md](PUBLISHING.md). The marketplace entry draft is at [market/person-clouds__dsh-workflow-shortcuts.yml](market/person-clouds__dsh-workflow-shortcuts.yml).

## License

[MIT](LICENSE)
