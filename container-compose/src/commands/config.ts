import type { ComposeProject } from "../types.js";

/** Prints the fully resolved plan (project name, services, networks, volumes) without touching
 *  the container system — the equivalent of `docker compose config`, for debugging/validation. */
export function printConfig(project: ComposeProject, log: (msg: string) => void): void {
  log(JSON.stringify(project, null, 2));
}
