#!/usr/bin/env node
/**
 * MCP server for managing Apple's `container` tool — Linux containers running
 * as lightweight VMs on macOS (Apple Silicon only, macOS 26+).
 *
 * Wraps the `container` CLI (https://github.com/apple/container) via execFile.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { describeError, runContainer, runContainerJson } from "./cli.js";

const server = new McpServer({
  name: "apple-container-mcp-server",
  version: "1.0.0",
});

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function jsonResult<T>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

server.registerTool(
  "container_system_start",
  {
    title: "Start Container System",
    description: `Start the background services required to run containers (apiserver, networking, image store).

Must be called before container_run, container_list, container_image_list, etc. will work.

Note: on a machine that has never had a default kernel installed, the underlying \`container system start\` command may prompt interactively to download one — that prompt cannot be answered through this tool. If this call times out or errors on a fresh install, run \`container system start\` once manually in a terminal to accept the kernel installation prompt, then retry.

Returns: plain text confirmation of the services that were started.`,
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const { stdout, stderr } = await runContainer(["system", "start"], 60_000);
      return textResult((stdout + stderr).trim() || "Container system services started.");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_system_stop",
  {
    title: "Stop Container System",
    description: `Stop all container background services. This also stops any currently running containers.

Returns: plain text confirmation.`,
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const { stdout, stderr } = await runContainer(["system", "stop"], 30_000);
      return textResult((stdout + stderr).trim() || "Container system services stopped.");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_system_status",
  {
    title: "Container System Status",
    description: `Check whether the container background services are running.

Returns: JSON with service status fields (status, apiserver version, install paths), or an explanation if the services are not running.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const data = await runContainerJson<unknown>(["system", "status"]);
      return jsonResult(data);
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

const RunInputSchema = {
  image: z.string().min(1).describe("Image reference to run, e.g. 'docker.io/library/alpine:latest'"),
  command: z.array(z.string()).optional().describe("Command and arguments to run inside the container, e.g. ['echo', 'hello']. Defaults to the image's entrypoint/CMD if omitted."),
  name: z.string().optional().describe("Name to assign to the container (used as its ID). Must be unique among existing containers."),
  detach: z.boolean().default(false).describe("Run in the background and return immediately with the container ID. Set true for long-running services; false (default) waits for the process to finish and returns its output, subject to a timeout."),
  remove: z.boolean().default(false).describe("Automatically delete the container once it stops (like `docker run --rm`)."),
  env: z.array(z.string()).optional().describe("Environment variables as 'KEY=VALUE' strings."),
  publish: z.array(z.string()).optional().describe("Port publish specs, format '[host-ip:]host-port:container-port[/protocol]', e.g. '8080:80'."),
  volumes: z.array(z.string()).optional().describe("Bind mounts, format 'host-path:container-path[:ro]'."),
  workdir: z.string().optional().describe("Initial working directory inside the container."),
  entrypoint: z.string().optional().describe("Override the image's entrypoint."),
  cpus: z.number().positive().optional().describe("Number of CPUs to allocate."),
  memory: z.string().optional().describe("Memory limit, e.g. '512M' or '2G'."),
  timeoutSeconds: z.number().int().positive().max(600).default(120).describe("Max seconds to wait for a foreground (non-detached) run before giving up. Ignored when detach=true."),
};

server.registerTool(
  "container_run",
  {
    title: "Run Container",
    description: `Run a container from an image, similar to \`docker run\`. Pulls the image if not already present locally.

By default runs in the foreground and returns the process's stdout/stderr once it exits (bounded by timeoutSeconds). Set detach=true to start it in the background and get the container ID back immediately instead — use this for anything long-running (servers, daemons).

Returns: text output of the run (foreground) or the new container's ID (detached).

Example: image="docker.io/library/alpine:latest", command=["echo","hi"] runs and returns "hi".
Example: image="docker.io/library/nginx:latest", detach=true, publish=["8080:80"] starts nginx in the background reachable at localhost:8080.`,
    inputSchema: RunInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async (params) => {
    const args = ["run"];
    if (params.detach) args.push("--detach");
    if (params.remove) args.push("--rm");
    if (params.name) args.push("--name", params.name);
    if (params.workdir) args.push("--workdir", params.workdir);
    if (params.entrypoint) args.push("--entrypoint", params.entrypoint);
    if (params.cpus) args.push("--cpus", String(params.cpus));
    if (params.memory) args.push("--memory", params.memory);
    for (const e of params.env ?? []) args.push("--env", e);
    for (const p of params.publish ?? []) args.push("--publish", p);
    for (const v of params.volumes ?? []) args.push("--volume", v);
    args.push(params.image);
    for (const c of params.command ?? []) args.push(c);

    try {
      const { stdout, stderr } = await runContainer(args, params.timeoutSeconds * 1000);
      return textResult((stdout + stderr).trim() || "(container produced no output)");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_list",
  {
    title: "List Containers",
    description: `List containers. By default only running containers are shown.

Returns: JSON array of containers with fields like id, image, status, and network/address info.`,
    inputSchema: {
      all: z.boolean().default(false).describe("Include stopped containers as well as running ones."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ all }) => {
    try {
      const args = ["list"];
      if (all) args.push("--all");
      const data = await runContainerJson<unknown>(args);
      return jsonResult(data);
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_stop",
  {
    title: "Stop Container",
    description: `Stop one or more running containers (sends a termination signal, then kills after the wait time if still running).

Returns: text confirmation of which containers were stopped.`,
    inputSchema: {
      containerIds: z.array(z.string()).optional().describe("IDs/names of containers to stop. Omit and set all=true to stop every running container instead."),
      all: z.boolean().default(false).describe("Stop all running containers. If true, containerIds is ignored."),
      timeoutSeconds: z.number().int().min(0).default(5).describe("Seconds to wait before force-killing."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ containerIds, all, timeoutSeconds }) => {
    if (!all && (!containerIds || containerIds.length === 0)) {
      return textResult("Error: provide containerIds, or set all=true to stop every running container.");
    }
    const args = ["stop", "--time", String(timeoutSeconds)];
    if (all) {
      args.push("--all");
    } else {
      args.push(...(containerIds ?? []));
    }
    try {
      const { stdout, stderr } = await runContainer(args, 30_000);
      return textResult((stdout + stderr).trim() || "Stopped.");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_delete",
  {
    title: "Delete Container",
    description: `Permanently delete one or more containers. Running containers are only deleted if force=true.

Returns: text confirmation of which containers were deleted.`,
    inputSchema: {
      containerIds: z.array(z.string()).optional().describe("IDs/names of containers to delete. Omit and set all=true to delete every container instead."),
      all: z.boolean().default(false).describe("Delete all containers. If true, containerIds is ignored."),
      force: z.boolean().default(false).describe("Delete even if the container is currently running."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ containerIds, all, force }) => {
    if (!all && (!containerIds || containerIds.length === 0)) {
      return textResult("Error: provide containerIds, or set all=true to delete every container.");
    }
    const args = ["delete"];
    if (force) args.push("--force");
    if (all) {
      args.push("--all");
    } else {
      args.push(...(containerIds ?? []));
    }
    try {
      const { stdout, stderr } = await runContainer(args, 30_000);
      return textResult((stdout + stderr).trim() || "Deleted.");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_logs",
  {
    title: "Fetch Container Logs",
    description: `Fetch stdout/stderr logs (or boot logs) for a container. Does not follow/stream — returns what's available at call time.

Returns: text log output.`,
    inputSchema: {
      containerId: z.string().min(1).describe("ID or name of the container."),
      tail: z.number().int().positive().optional().describe("Only return this many lines from the end of the logs. Omit to return everything."),
      boot: z.boolean().default(false).describe("Return the container's boot log instead of its stdio log."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ containerId, tail, boot }) => {
    const args = ["logs"];
    if (boot) args.push("--boot");
    if (tail) args.push("-n", String(tail));
    args.push(containerId);
    try {
      const { stdout, stderr } = await runContainer(args, 30_000);
      return textResult((stdout + stderr).trim() || "(no log output)");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_exec",
  {
    title: "Exec in Container",
    description: `Run a new command inside an already-running container (like \`docker exec\`).

Returns: text output of the command.`,
    inputSchema: {
      containerId: z.string().min(1).describe("ID or name of the running container."),
      command: z.array(z.string()).min(1).describe("Command and arguments to execute, e.g. ['ls', '-la', '/']."),
      env: z.array(z.string()).optional().describe("Environment variables as 'KEY=VALUE' strings."),
      workdir: z.string().optional().describe("Working directory for the executed process."),
      timeoutSeconds: z.number().int().positive().max(600).default(60).describe("Max seconds to wait for the command to finish."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ containerId, command, env, workdir, timeoutSeconds }) => {
    const args = ["exec"];
    for (const e of env ?? []) args.push("--env", e);
    if (workdir) args.push("--workdir", workdir);
    args.push(containerId, ...command);
    try {
      const { stdout, stderr } = await runContainer(args, timeoutSeconds * 1000);
      return textResult((stdout + stderr).trim() || "(command produced no output)");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_inspect",
  {
    title: "Inspect Container",
    description: `Get detailed configuration and runtime state for one or more containers (network addresses, mounts, resource limits, process info).

Returns: JSON array of container detail objects.`,
    inputSchema: {
      containerIds: z.array(z.string()).min(1).describe("IDs/names of containers to inspect."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ containerIds }) => {
    try {
      const { stdout } = await runContainer(["inspect", ...containerIds], 30_000);
      return jsonResult(JSON.parse(stdout.trim() || "[]"));
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

server.registerTool(
  "container_image_list",
  {
    title: "List Images",
    description: `List container images available locally.

Returns: JSON array of images with reference, digest, and size info.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    try {
      const data = await runContainerJson<unknown>(["image", "list"]);
      return jsonResult(data);
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_image_pull",
  {
    title: "Pull Image",
    description: `Pull an image from a registry into the local image store, without running it.

Returns: text confirmation once the pull completes.`,
    inputSchema: {
      reference: z.string().min(1).describe("Image reference to pull, e.g. 'docker.io/library/nginx:latest'."),
      platform: z.string().optional().describe("Limit the pull to a specific platform, format 'os/arch[/variant]', e.g. 'linux/arm64'."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ reference, platform }) => {
    const args = ["image", "pull"];
    if (platform) args.push("--platform", platform);
    args.push(reference);
    try {
      const { stdout, stderr } = await runContainer(args, 300_000);
      return textResult((stdout + stderr).trim() || `Pulled ${reference}.`);
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_image_delete",
  {
    title: "Delete Image",
    description: `Permanently delete one or more local images.

Returns: text confirmation of which images were deleted.`,
    inputSchema: {
      images: z.array(z.string()).optional().describe("Image references to delete. Omit and set all=true to delete every local image instead."),
      all: z.boolean().default(false).describe("Delete all local images. If true, images is ignored."),
      force: z.boolean().default(false).describe("Ignore errors for images that are not found."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ images, all, force }) => {
    if (!all && (!images || images.length === 0)) {
      return textResult("Error: provide images, or set all=true to delete every local image.");
    }
    const args = ["image", "delete"];
    if (force) args.push("--force");
    if (all) {
      args.push("--all");
    } else {
      args.push(...(images ?? []));
    }
    try {
      const { stdout, stderr } = await runContainer(args, 30_000);
      return textResult((stdout + stderr).trim() || "Deleted.");
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

server.registerTool(
  "container_image_tag",
  {
    title: "Tag Image",
    description: `Create a new reference for an existing local image (like \`docker tag\`).

Returns: text confirmation.`,
    inputSchema: {
      source: z.string().min(1).describe("Existing image reference, format 'image-name[:tag]'."),
      target: z.string().min(1).describe("New image reference to create."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ source, target }) => {
    try {
      const { stdout, stderr } = await runContainer(["image", "tag", source, target], 15_000);
      return textResult((stdout + stderr).trim() || `Tagged ${source} as ${target}.`);
    } catch (error) {
      return textResult(describeError(error));
    }
  }
);

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("apple-container-mcp-server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
