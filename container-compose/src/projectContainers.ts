import { runContainerJson } from "./containerCli.js";
import { LABEL_PROJECT, LABEL_SERVICE } from "./naming.js";

export interface ProjectContainer {
  id: string;
  name: string;
  service: string;
  status: string;
  raw: Record<string, unknown>;
}

interface RawContainer {
  id?: string;
  configuration?: { id?: string; labels?: Record<string, string> };
  status?: { state?: string };
  [key: string]: unknown;
}

/** Verified against `container list --all --format json` (v1.0.0): top-level `id` and `status.state`,
 *  labels under `configuration.labels`. */
export async function listProjectContainers(projectName: string): Promise<ProjectContainer[]> {
  const all = await runContainerJson<RawContainer[]>(["list", "--all"]).catch(() => []);
  const results: ProjectContainer[] = [];
  for (const c of all) {
    const labels = c.configuration?.labels;
    if (!labels || labels[LABEL_PROJECT] !== projectName) continue;
    const id = c.id ?? c.configuration?.id ?? "unknown";
    results.push({
      id: String(id),
      name: String(id),
      service: labels[LABEL_SERVICE] ?? "unknown",
      status: c.status?.state ?? "unknown",
      raw: c as Record<string, unknown>,
    });
  }
  return results;
}
