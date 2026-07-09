# container-compose

Run standard, **unmodified** `docker-compose.yml` files on top of [Apple's `container`](https://github.com/apple/container). No Compose-specific fork of your compose file, no rewriting — point it at the same file you'd hand to `docker compose`.

Apple's `container` (v1.0.0) has no native multi-container orchestration. This fills that gap: it parses your compose file, resolves the dependency graph, and drives a sequence of `container run` / `network create` / `volume create` calls to reproduce the stack.

## Install

```bash
npm install
npm run build
npm link   # optional — makes `container-compose` available globally
```

Or run it directly: `node dist/cli.js <command>`.

## Usage

```bash
container-compose up          # start everything, stream logs, Ctrl+C to stop
container-compose up -d       # start everything in the background
container-compose ps          # list this project's containers
container-compose logs redis  # logs for one service
container-compose logs -f     # follow logs for all services
container-compose down        # stop + remove containers and the project network
container-compose down -v     # also remove named volumes
container-compose build       # build images for services with a `build:` step
container-compose config      # print the fully resolved plan as JSON (no side effects)
```

Global options (put before the subcommand): `-f/--file <path>` (default: auto-detects `compose.yaml` / `compose.yml` / `docker-compose.yaml` / `docker-compose.yml` in the current directory), `-p/--project-name <name>` (default: the compose file's directory name — same resolution order as `docker compose`).

## What's supported

Parsed directly from the Compose Spec, translated to `container` CLI flags:

`image`, `build` (context/dockerfile/target/args), `container_name`, `command`, `entrypoint`, `environment`, `env_file`, `ports`, `volumes` (bind mounts and named volumes), `depends_on`, `working_dir`, `networks`, `labels`, `user`, `cap_add`/`cap_drop`, `read_only`, `shm_size`, `tmpfs`, `platform`, `cpus`, top-level `networks:` and `volumes:`, and the top-level `name:` field.

### Service-name resolution (important)

Apple's `container` gives every container a real IP on its network, but — unlike Docker's user-defined bridge networks — **provides no embedded DNS** to resolve other containers by name. `container-compose` works around this: after starting all services, it patches `/etc/hosts` inside every container with the other services' names → IPs, so code that connects to `redis`, `db`, etc. by service name keeps working exactly like it would under `docker compose`.

This requires each container to have `/bin/sh` and a writable `/etc/hosts` (true for essentially all standard Linux images). If an image lacks a shell, you'll get a warning and that container simply won't have the other services' names pre-resolved — everything else still runs.

### Not supported

The underlying `container` CLI has no equivalent for these, so they're parsed (to avoid silently ignoring them without telling you) but have no effect — `container-compose` prints a warning for each one found in your file:

- `restart` — no restart-policy flag on `container run`
- `healthcheck` — `depends_on` conditions (`service_healthy`, etc.) are treated as plain "start after" ordering, not health-gated
- `privileged`
- `deploy` (replicas, resource reservations, etc. — this tool is single-host, single-instance per service)
- `profiles`
- `secrets` / `configs` (Swarm-style)
- `extends`
- `logging` driver configuration

If you rely on any of these, check before assuming your stack behaves identically to `docker compose up`.

## How it maps compose concepts to `container`

| Compose concept | Realized as |
|---|---|
| Project (compose file's directory, or `-p`) | Prefix for every resource name |
| Default network | `container network create <project>_default` |
| Named volume `foo:` | `container volume create <project>_foo` |
| Service `web` | `container run --name <project>-web-1 --label com.container-compose.project=<project> --label com.container-compose.service=web ...` |
| `depends_on` | Topological start order (Kahn's algorithm; cycles are rejected with a clear error) |
| Service discovery | Post-start `/etc/hosts` patching (see above) |

Every container/network/volume this tool creates is labeled `com.container-compose.project=<name>`, so `ps`/`logs`/`down` can reliably find "this project's stuff" even if you used `container_name` overrides.

## Example

See [`examples/docker-compose.yml`](./examples/docker-compose.yml) — a two-service stack (Redis + a client) verified end-to-end against a real `container` installation, including port publishing and cross-container name resolution.

## Development

```bash
npm run dev     # tsx watch mode
npm run build   # tsc compile to dist/
```

No test framework is wired up yet — validation so far has been a real, manual end-to-end run (`up` → `ps` → `logs` → port-check from host → `down -v`) against Apple's `container` v1.0.0. Contributions adding automated tests are welcome.
