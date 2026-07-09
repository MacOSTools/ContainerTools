import type { ComposeProject } from "../types.js";
import { containerSystemIsRunning, ensureNetwork, ensureVolume, runContainer, spawnContainer } from "../containerCli.js";
import { topologicalOrder } from "../graph.js";
import { buildRunArgs } from "../runArgs.js";
import { containerName } from "../naming.js";
import { resolveServiceImage } from "./build.js";
import { stopProject } from "./down.js";
import { wireServiceDiscovery } from "../serviceDiscovery.js";

export interface UpOptions {
  detach: boolean;
}

export async function up(project: ComposeProject, options: UpOptions, log: (msg: string) => void): Promise<void> {
  if (!(await containerSystemIsRunning())) {
    throw new Error("The container system services aren't running. Run 'container system start' first.");
  }

  for (const network of project.networks) {
    log(`Ensuring network '${network.name}'`);
    await ensureNetwork(network.name, { internal: network.internal, subnet: network.subnet });
  }
  for (const volume of project.volumes) {
    log(`Ensuring volume '${volume.name}'`);
    await ensureVolume(volume.name);
  }

  const ordered = topologicalOrder(project.services);
  const startedNames: string[] = [];

  for (const service of ordered) {
    const image = await resolveServiceImage(service, project.projectName, log);
    const name = containerName(project.projectName, service.name, service.containerName);
    log(`Starting '${service.name}' as ${name} (${image})`);
    const args = buildRunArgs(service, project.projectName, image);
    await runContainer(args, 120_000);
    startedNames.push(name);
  }

  log("Wiring up service-name resolution between containers...");
  await wireServiceDiscovery(startedNames, log);

  log(`\n${startedNames.length} service(s) started for project '${project.projectName}'.`);

  if (options.detach) {
    log("Running in the background (--detach). Use 'container-compose ps' to check status.");
    return;
  }

  log("Attached to logs — press Ctrl+C to stop all services.\n");
  await streamLogsUntilInterrupted(project, startedNames);
}

function streamLogsUntilInterrupted(project: ComposeProject, containerNames: string[]): Promise<void> {
  return new Promise((resolve) => {
    const children = containerNames.map((name) => {
      const child = spawnContainer(["logs", "--follow", name]);
      const prefix = `[${name}] `;
      child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(prefixLines(chunk.toString(), prefix)));
      child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(prefixLines(chunk.toString(), prefix)));
      return child;
    });

    let stopping = false;
    const onInterrupt = async () => {
      if (stopping) return;
      stopping = true;
      process.stdout.write("\nStopping services...\n");
      for (const child of children) child.kill();
      await stopProject(project, { removeVolumes: false, removeNetworks: false });
      process.removeListener("SIGINT", onInterrupt);
      resolve();
    };
    process.on("SIGINT", onInterrupt);
  });
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .filter((line, i, arr) => line.length > 0 || i < arr.length - 1)
    .map((line) => (line ? prefix + line : line))
    .join("\n");
}
