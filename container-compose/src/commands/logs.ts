import type { ComposeProject } from "../types.js";
import { runContainer, spawnContainer } from "../containerCli.js";
import { listProjectContainers } from "../projectContainers.js";

export interface LogsOptions {
  service?: string;
  follow: boolean;
  tail?: number;
}

export async function logs(project: ComposeProject, options: LogsOptions, log: (msg: string) => void): Promise<void> {
  const containers = await listProjectContainers(project.projectName);
  const targets = options.service ? containers.filter((c) => c.service === options.service) : containers;

  if (targets.length === 0) {
    log(
      options.service
        ? `No running container found for service '${options.service}' in project '${project.projectName}'.`
        : `No containers found for project '${project.projectName}'.`
    );
    return;
  }

  if (!options.follow) {
    for (const container of targets) {
      const args = ["logs"];
      if (options.tail) args.push("-n", String(options.tail));
      args.push(container.id);
      const { stdout, stderr } = await runContainer(args, 30_000);
      const prefix = targets.length > 1 ? `[${container.service}] ` : "";
      for (const line of (stdout + stderr).split("\n")) if (line) log(prefix + line);
    }
    return;
  }

  await new Promise<void>((resolve) => {
    const children = targets.map((container) => {
      const args = ["logs", "--follow"];
      if (options.tail) args.push("-n", String(options.tail));
      args.push(container.id);
      const child = spawnContainer(args);
      const prefix = targets.length > 1 ? `[${container.service}] ` : "";
      child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(prefixLines(chunk.toString(), prefix)));
      child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(prefixLines(chunk.toString(), prefix)));
      return child;
    });
    process.on("SIGINT", () => {
      for (const child of children) child.kill();
      resolve();
    });
  });
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .filter((line, i, arr) => line.length > 0 || i < arr.length - 1)
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}
