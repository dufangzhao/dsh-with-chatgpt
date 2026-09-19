# DSH with ChatGPT

ChatGPT plans and reviews; DeepSeek Harness (DSH) executes.

This is a DSH-native adaptation of
[`XiaoDuoYa/codex-with-chatgpt`](https://github.com/XiaoDuoYa/codex-with-chatgpt).
It preserves the upstream read-only MCP bridge, OAuth PKCE pairing, Cloudflare
tunnel support, execution records, and checkpoint protocol. The executor layer
is replaced with a Cordis plugin and a bundled DSH runtime skill.

See [README.zh-CN.md](./README.zh-CN.md) for the Chinese guide.

## Architecture

```text
ChatGPT web (planner/reviewer)
          |
          | OAuth + read-only MCP over HTTPS
          v
Cloudflare tunnel -> local D2C bridge -> current workspace (read-only)
                                      -> sanitized execution records

DSH agent (sole executor) -> edits / commands / tests / Git
          |
          +-> dsh_chatgpt (constrained bridge lifecycle tool)
          +-> BrowserSkill (ChatGPT web interaction)
```

ChatGPT never receives shell or write tools. The `dsh_chatgpt` tool does not
accept arbitrary command strings and binds workspace operations to the current
DSH session directory.

## Tested environment

- DSH `0.1.5-rc.2`
- Node.js `22.19.x` or `24.x`
- `@wxg-prc-cpg/browser-skill-dsh-plugin` `0.1.2`
- cloudflared `2026.9.1`

DSH is currently prerelease software. Re-run the startup and tool-call checks
when upgrading outside the range in `compatibility.json`.

## Install

```powershell
pnpm install
pnpm build
dsh plugin --profile web add file:C:/absolute/path/to/dsh-with-chatgpt
```

The package bundle inserts the `dsh-with-chatgpt` Cordis plugin. The companion
BrowserSkill plugin must already be installed if DSH should automate ChatGPT web.

Verify:

```powershell
dsh plugin --profile web list
dsh --profile web --dump-config
dsh --profile web --no-open --port 0
```

Inside DSH, ask:

```text
使用 DSH with ChatGPT，把 ChatGPT 作为规划和审查端连接到当前项目。
```

## CLI

The bundled bridge can also be operated directly:

```powershell
d2c --help
d2c status --workspace C:/path/to/project --json
d2c unpair --workspace C:/path/to/project
```

DSH plugin state is stored separately from the upstream Codex integration under
the OS-local `dsh-with-chatgpt` state directory.

## Security

- The MCP tools exposed to ChatGPT are read-only.
- Pairing uses a short-lived one-time code and OAuth PKCE.
- Tokens and state remain local and are not committed to the repository.
- Browser cookies and ChatGPT account tokens are never copied into the plugin.
- DSH retains sole authority for edits, commands, tests, commits, and publishing.

## License and attribution

MIT. See `LICENSE` and `NOTICE.md`.
