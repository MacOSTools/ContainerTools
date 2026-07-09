import type { ComposeProject } from "../types.js";
import { removeNetworkIfExists, removeVolumeIfExists, runContainer } from "../containerCli.js";
import { listProjectContainers } from "../projectContainers.js";

export interface DownOptions {
  removeVolumes: boolean;
  removeNetworks: boolean;
}

/** Stops (does not delete) every container belonging to the project — used for Ctrl+C during `up`. */
export async function stopProject(project: ComposeProject, options: Partial<DownOptions> = {}): Promise<void> {
  const containers = await listProjectContainers(project.projectName);
  for (const container of containers) {
    await runContainer(["stop", container.id], 30_000).catch(() => undefined);
  }
  if (options.removeNetworks) {
    for (const network of project.networks) await removeNetworkIfExists(network.name);
  }
  if (options.removeVolumes) {
    for (const volume of project.volumes) await removeVolumeIfExists(volume.name);
  }
}

/** Full teardown: stop + delete containers, remove the project's networks, optionally its volumes. */
export async function down(project: ComposeProject, options: DownOptions, log: (msg: string) => void): Promise<void> {
  const containers = await listProjectContainers(project.projectName);
  if (containers.length === 0) {
    log(`No containers found for project '${project.projectName}'.`);
  }
  for (const container of containers) {
    log(`Stopping and removing ${container.name} (${container.service})`);
    await runContainer(["stop", container.id], 30_000).catch(() => undefined);
    await runContainer(["delete", "--force", container.id], 30_000).catch(() => undefined);
  }

  for (const network of project.networks) {
    log(`Removing network '${network.name}'`);
    await removeNetworkIfExists(network.name);
  }

  if (options.removeVolumes) {
    for (const volume of project.volumes) {
      log(`Removing volume '${volume.name}'`);
      await removeVolumeIfExists(volume.name);
    }
  } else if (project.volumes.length > 0) {
    log(`Keeping ${project.volumes.length} named volume(s) (pass --volumes to remove them too).`);
  }
}
