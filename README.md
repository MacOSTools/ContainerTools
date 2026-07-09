# Container Tools

Tooling for [Apple's `container`](https://github.com/apple/container) — the native macOS CLI that runs Linux containers as lightweight per-container VMs on Apple Silicon.

This repo has two independent tools plus a Claude Code skill tying them together:

| Path | What it is |
|---|---|
| [`mcp-server/`](./mcp-server) | An MCP server exposing the full `container` CLI (run, list, stop, delete, logs, exec, inspect, images, system control) as tools for AI agents |
| [`container-compose/`](./container-compose) | A CLI that runs **standard, unmodified `docker-compose.yml` files** on top of `container` — Apple's tool has no native Compose support as of v1.0.0 |
| [`skill/apple-container/`](./skill/apple-container) | A Claude Code skill documenting both tools (mirrors the live copy in `~/.claude/skills/apple-container/`) |

## Why this exists

Apple's `container` (v1.0.0, June 2026) is a genuinely good, fast, OCI-compatible Docker Desktop alternative for Apple Silicon — but as of this release it ships with:
- no MCP/agent integration, and
- **no Docker Compose support** (the most-requested missing feature — see [apple/container#194](https://github.com/apple/container/discussions/194)).

This repo fills both gaps.

## Requirements

- macOS 26+, Apple Silicon (Apple's `container` doesn't run on Intel).
- [Apple's `container` tool](https://github.com/apple/container) installed and on `PATH`.
- Node.js 18+.

## Quick start

```bash
# 1. Start Apple's container services (first run may prompt to install a default kernel — accept it)
container system start

# 2. Build both tools
cd mcp-server && npm install && npm run build && cd ..
cd container-compose && npm install && npm run build && cd ..

# 3. Register the MCP server with Claude Code (user-wide, available in every project)
claude mcp add apple-container -s user -- node "$(pwd)/mcp-server/dist/index.js"

# 4. Run a standard compose file with container-compose
cd container-compose/examples
node ../dist/cli.js up -d
node ../dist/cli.js ps
node ../dist/cli.js down
```

See each subproject's README for full details.

## License

MIT — see [LICENSE](./LICENSE).
