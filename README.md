<div align="center">

# 🧰 Container Tools

**AI-agent integration and Docker Compose support for [Apple's `container`](https://github.com/apple/container)**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Apple Silicon](https://img.shields.io/badge/Apple%20Silicon-required-000000?logo=apple&logoColor=white)](https://github.com/apple/container)
[![Platform: macOS 26+](https://img.shields.io/badge/macOS-26%2B-000000?logo=apple&logoColor=white)](https://github.com/apple/container)

</div>

---

Apple's `container` (v1.0.0, June 2026) is a fast, native, OCI-compatible alternative to Docker Desktop — Linux containers running as lightweight per-container VMs on Apple Silicon. It's genuinely good. It's also missing two things almost everyone reaches for on day one: **an AI-agent integration** and **Docker Compose support**.

**Container Tools** fills both gaps.

## Contents

| Tool | What it does |
|---|---|
| 🤖 [`mcp-server/`](./mcp-server) | MCP server exposing the full `container` CLI as tools for AI agents (Claude Code or any MCP client) |
| 🧩 [`container-compose/`](./container-compose) | Runs **standard, unmodified `docker-compose.yml` files** on top of `container` |
| 📖 [`skill/apple-container/`](./skill/apple-container) | Claude Code skill documenting both tools |

```
┌─────────────────────┐      ┌──────────────────────┐      ┌───────────────────────┐
│   Your compose.yml   │ ──▶ │   container-compose   │ ──▶ │   container (Apple)    │
│  (no changes needed)  │      │  parse · order · wire  │      │  run · network · volume │
└─────────────────────┘      └──────────────────────┘      └───────────────────────┘

┌──────────────┐      ┌────────────────────────┐      ┌───────────────────────┐
│  AI Agent /   │ ──▶ │  apple-container-mcp-   │ ──▶ │   container (Apple)    │
│  Claude Code  │      │       server            │      │  run · list · logs ·…  │
└──────────────┘      └────────────────────────┘      └───────────────────────┘
```

## Why this exists

- **No MCP/agent integration** — nothing lets an AI coding agent drive `container` natively.
- **No Docker Compose support** — the single most-requested missing feature on the project (see [apple/container discussion #194](https://github.com/apple/container/discussions/194), 150+ replies, no timeline from Apple).

Rather than wait, this repo builds both — and does so honestly: everything below has been run against a real `container` v1.0.0 install, not just written and hoped for.

## Requirements

- macOS 26+ on **Apple Silicon** (Apple's `container` does not run on Intel Macs)
- [Apple's `container` tool](https://github.com/apple/container) installed and on `PATH`
- Node.js 18+

## Quick start

```bash
# 1. Start Apple's container services
#    (first run ever may interactively prompt to install a default kernel — accept it)
container system start

# 2. Build both tools
cd mcp-server && npm install && npm run build && cd ..
cd container-compose && npm install && npm run build && cd ..

# 3. Register the MCP server with Claude Code — user-wide, available in every project
claude mcp add apple-container -s user -- node "$(pwd)/mcp-server/dist/index.js"

# 4. Run a standard, unmodified compose file
cd container-compose/examples
node ../dist/cli.js up -d
node ../dist/cli.js ps
node ../dist/cli.js down
```

See [`mcp-server/README.md`](./mcp-server/README.md) and [`container-compose/README.md`](./container-compose/README.md) for full tool documentation.

## Limitations

These come from Apple's `container` itself, not from anything this repo could paper over — documented here so nobody's surprised mid-migration:

| Limitation | Impact | Workaround in this repo |
|---|---|---|
| **No embedded DNS between containers** | Services can't resolve each other by name on a custom network out of the box | `container-compose` patches `/etc/hosts` in every container after startup — see [container-compose limitations](./container-compose/README.md#whats-supported) |
| **No `restart` policy flag** | Containers don't auto-restart on crash/reboot | Not addressed — `restart:` in compose files is parsed and warned about, not enforced |
| **No healthcheck-gated startup** | `depends_on: condition: service_healthy` can't be honored | Falls back to plain "start after" ordering |
| **No Swarm-style `secrets`/`configs`/`deploy`** | Multi-replica / secret-injection compose features have no equivalent | Parsed, warned, ignored |
| **Apple Silicon only** | No Intel Mac, no Linux, no Windows | N/A — inherent to `container` |
| **One VM per container** | Stronger isolation than Docker Desktop's shared-VM model, but slower cold starts for many short-lived containers | N/A — architectural tradeoff, not a bug |
| **First-run kernel install is interactive** | `container system start` prompts to download a kernel on a fresh machine; can't be scripted/answered by the MCP server | Run it once by hand in a real terminal, then automation works |

## Roadmap

### `container-compose`

- [ ] **Automated test suite** — parser unit tests, topological-sort edge cases (cycles, diamonds), a CI job that runs a real `up`/`down` cycle against `container` on a macOS runner
- [ ] **`docker-compose.override.yml` support** — merge multiple compose files like real Compose does
- [ ] **Variable interpolation** — `${VAR}` / `${VAR:-default}` substitution from `.env` and the shell environment
- [ ] **`exec` and `run` subcommands** — one-off commands against a service (`container-compose exec web sh`, `container-compose run web ./migrate.sh`)
- [ ] **`restart` policy emulation** — a lightweight supervisor loop, since the underlying CLI has no native flag
- [ ] **Healthcheck-aware `depends_on`** — poll `healthcheck:` commands via `container exec` before starting dependents, closing the biggest behavioral gap vs. real Compose
- [ ] **`pull` and `stop` (without delete) subcommands** — parity with the full `docker compose` command set
- [ ] **Volume/network `prune`** — cleanup for orphaned project resources
- [ ] **Multi-platform build support** — `--platform` fan-out for `build:` services targeting more than one architecture
- [ ] **Homebrew formula** — `brew install container-compose` instead of a manual clone + build

### `mcp-server`

- [ ] **`container_build` tool** — expose `container build` directly (currently only reachable indirectly)
- [ ] **`container_stats` tool** — resource usage per container
- [ ] **`container_prune` tool** — remove stopped containers in bulk
- [ ] **Volume and network management tools** — `container_volume_list/create/delete`, `container_network_list/create/delete`
- [ ] **Streaming logs over MCP** — real-time `--follow` support once the MCP transport story for long-lived streams matures

Contributions and issues welcome for any of the above.

## License

MIT — see [LICENSE](./LICENSE).
