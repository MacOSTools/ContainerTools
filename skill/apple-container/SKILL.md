---
name: apple-container
description: Manage Apple's `container` tool — the native macOS CLI for running Linux containers as lightweight per-container VMs on Apple Silicon (github.com/apple/container). Use whenever the user mentions "container" (Apple's tool, not Docker), wants to run/stop/list/inspect containers or images on this Mac, wants to run a docker-compose.yml against it (use container-compose, since Apple's tool has no native Compose support), or asks about the apple-container-mcp-server. Prefer the MCP tools (prefixed `container_*`) when connected; fall back to the raw CLI commands documented here otherwise.
---

# Apple `container` Tool

Apple's `container` (https://github.com/apple/container) runs Linux containers as **one lightweight VM per container** on Apple Silicon Macs (macOS 26+, no Intel support). It's OCI-compatible — same image registries as Docker.

## Preferred: MCP server

A dedicated MCP server, `apple-container` (registered at user scope, so available in every Claude Code session), wraps the full CLI:

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

Source: `/Users/admin/Documents/Thomas-SRC/Container-Tools/mcp-server/`. Rebuild after edits: `npm run build` in that directory (no need to re-run `claude mcp add` — Claude Code re-execs `dist/index.js` each session).

**If these tools aren't showing up**: the MCP server was likely just added/updated and the current session hasn't picked it up yet — restart Claude Code / start a new session. Verify registration independently with `claude mcp get apple-container` (should show `✔ Connected`).

## Fallback: raw CLI

If the MCP server is unavailable, use the `container` binary directly:

```bash
container system start          # must run first, every session
container system status
container run --rm <image> <cmd...>
container run -d --name <name> -p <host>:<container> <image>   # detached, port-published
container list -a                # -a includes stopped
container logs -n 50 <id>
container exec <id> <cmd...>
container stop <id>
container delete <id>
container image list
container image pull <ref>
container system stop            # when done
```

## Docker Compose: use `container-compose`

Apple's `container` has **no native Compose support** (as of v1.0.0 — the top requested feature on the project). Use the bundled `container-compose` tool instead — it runs standard, unmodified `docker-compose.yml` files directly:

```bash
cd /Users/admin/Documents/Thomas-SRC/Container-Tools/container-compose
node dist/cli.js up -d          # or: -f <path> -p <project-name>
node dist/cli.js ps
node dist/cli.js logs <service>
node dist/cli.js down [-v]
```

It handles dependency ordering (`depends_on`), named volumes, custom networks, port publishing, and — importantly — patches `/etc/hosts` in every container after startup so services can resolve each other **by name** (e.g. `redis`, `db`), since Apple's `container` provides no embedded DNS between containers on a custom network the way Docker does. Full supported/unsupported field list in `container-compose/README.md`.

## Known gotchas

- **First-time kernel install prompt**: on a machine that's never run it, `container system start` prompts interactively to download a default kernel (kata-containers). This can't be answered non-interactively — if a script/tool call hangs or errors on a fresh install, run `container system start` once by hand in a real terminal to accept it, then automation works from then on.
- **Apple Silicon only** — no Intel Mac support, no Linux/Windows.
- **One VM per container** — stronger isolation than Docker Desktop's shared-VM model, but higher per-container startup cost. Don't expect Docker-level cold-start speed for many short-lived containers.
- **Leave it stopped when idle**: prefer calling `container_system_stop` / `container system stop` once you're done with a task, rather than leaving the background services running indefinitely.
