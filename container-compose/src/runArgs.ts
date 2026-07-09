import type { ComposeService } from "./types.js";
import { LABEL_PROJECT, LABEL_SERVICE, containerName } from "./naming.js";

/** Builds the full `container run` argument list for one service. Image must already be
 *  resolved (built and tagged, or a pullable reference) by the time this is called. */
export function buildRunArgs(service: ComposeService, projectName: string, image: string): string[] {
  const name = containerName(projectName, service.name, service.containerName);
  const args = ["run", "--detach", "--name", name];

  args.push("--label", `${LABEL_PROJECT}=${projectName}`);
  args.push("--label", `${LABEL_SERVICE}=${service.name}`);
  for (const label of service.labels) args.push("--label", label);

  for (const network of service.networks) args.push("--network", network);
  for (const env of service.environment) args.push("--env", env);
  for (const port of service.ports) args.push("--publish", normalizePort(port));
  for (const volume of service.volumes) args.push("--volume", volume);
  for (const cap of service.capAdd) args.push("--cap-add", cap);
  for (const cap of service.capDrop) args.push("--cap-drop", cap);
  for (const tmpfs of service.tmpfs) args.push("--tmpfs", tmpfs);

  if (service.workingDir) args.push("--workdir", service.workingDir);
  if (service.user) args.push("--user", service.user);
  if (service.readOnly) args.push("--read-only");
  if (service.shmSize) args.push("--shm-size", service.shmSize);
  if (service.platform) args.push("--platform", service.platform);
  if (service.cpus) args.push("--cpus", String(service.cpus));
  if (service.memory) args.push("--memory", service.memory);
  if (service.entrypoint) args.push("--entrypoint", service.entrypoint.join(" "));

  args.push(image);
  if (service.command) args.push(...service.command);

  return args;
}

/** Compose allows bare container ports ("80") — `container run --publish` requires host:container. */
function normalizePort(port: string): string {
  if (port.includes(":")) return port;
  return `${port}:${port}`;
}
