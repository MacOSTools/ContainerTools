# apple-container-mcp-server

An MCP server exposing [Apple's `container`](https://github.com/apple/container) CLI as tools for AI agents (Claude Code, or any MCP client).

## Install

```bash
npm install
npm run build
```

## Register with Claude Code

```bash
claude mcp add apple-container -s user -- node "$(pwd)/dist/index.js"
```

`-s user` registers it once, available in every project. Restart Claude Code (or start a new session) for a running session to pick up a newly-registered server.

## Tools

| Tool | Purpose |
|---|---|
| `container_system_start` | Start background services (required before anything else works) |
| `container_system_stop` | Stop all services (also stops running containers) |
| `container_system_status` | Check if services are running |
| `container_run` | Run a container from an image (foreground or `detach=true`) |
| `container_list` | List containers (`all=true` for stopped ones too) |
| `container_stop` | Stop running container(s) |
| `container_delete` | Permanently delete container(s) |
| `container_logs` | Fetch stdout/stderr or boot logs |
| `container_exec` | Run a command in an already-running container |
| `container_inspect` | Full JSON detail on container(s) |
| `container_image_list` | List local images |
| `container_image_pull` | Pull an image without running it |
| `container_image_delete` | Delete local image(s) |
| `container_image_tag` | Create a new reference for an existing image |

Every tool wraps the real CLI via `execFile` (no shell interpolation) and returns actionable error messages — e.g. detecting "services not running" and telling the agent to call `container_system_start` first.

## Known limitation

On a machine that's never run `container` before, `container system start` prompts interactively to install a default kernel. That prompt can't be answered through this MCP server (no TTY) — run `container system start` once by hand in a terminal first on a fresh install, then this server's `container_system_start` tool works for all subsequent sessions.

## Development

```bash
npm run dev     # tsx watch mode
npm run build   # tsc compile to dist/
```
