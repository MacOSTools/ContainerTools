import * as path from "node:path";

/** Compose project names are lowercase, alphanumeric plus - and _, per the Compose Spec. */
export function sanitizeProjectName(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned || "container-compose-project";
}

/** Resolution order matches `docker compose`: --project-name flag > env var > top-level
 *  `name:` field in the compose file > the compose file's directory name. */
export function resolveProjectName(options: {
  flag?: string;
  env?: string;
  fileField?: string;
  composeFilePath: string;
}): string {
  const raw =
    options.flag ?? options.env ?? options.fileField ?? path.basename(path.dirname(path.resolve(options.composeFilePath)));
  return sanitizeProjectName(raw);
}

export const LABEL_PROJECT = "com.container-compose.project";
export const LABEL_SERVICE = "com.container-compose.service";

export function defaultNetworkName(projectName: string): string {
  return `${projectName}_default`;
}

export function volumeName(projectName: string, name: string): string {
  return `${projectName}_${name}`;
}

export function containerName(projectName: string, serviceName: string, override?: string): string {
  return override ?? `${projectName}-${serviceName}-1`;
}
