import type { ComposeProject, ComposeService } from "../types.js";
import { runContainer } from "../containerCli.js";

/** Resolves the image to run for a service: builds it if `build:` is set, otherwise uses `image`.
 *  Returns the image reference to pass to `container run`. */
export async function resolveServiceImage(
  service: ComposeService,
  projectName: string,
  log: (msg: string) => void
): Promise<string> {
  if (!service.build) {
    if (!service.image) throw new Error(`Service '${service.name}' has neither 'image' nor 'build'`);
    return service.image;
  }

  const tag = service.image ?? `${projectName}_${service.name}:latest`;
  const args = ["build", "--tag", tag];
  if (service.build.dockerfile) args.push("--file", `${service.build.context}/${service.build.dockerfile}`);
  if (service.build.target) args.push("--target", service.build.target);
  for (const [key, value] of Object.entries(service.build.args ?? {})) {
    args.push("--build-arg", `${key}=${value}`);
  }
  args.push(service.build.context);

  log(`Building '${service.name}' from ${service.build.context} -> ${tag}`);
  await runContainer(args, 600_000);
  return tag;
}

export async function buildProject(project: ComposeProject, log: (msg: string) => void): Promise<void> {
  const toBuild = project.services.filter((s) => s.build);
  if (toBuild.length === 0) {
    log("No services define a 'build' step.");
    return;
  }
  for (const service of toBuild) {
    await resolveServiceImage(service, project.projectName, log);
  }
}
