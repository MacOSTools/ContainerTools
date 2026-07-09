import type { ComposeProject } from "../types.js";
import { listProjectContainers } from "../projectContainers.js";

export async function ps(project: ComposeProject, log: (msg: string) => void): Promise<void> {
  const containers = await listProjectContainers(project.projectName);
  if (containers.length === 0) {
    log(`No containers found for project '${project.projectName}'.`);
    return;
  }

  const rows = containers.map((c) => [c.service, c.name, c.status, c.id]);
  const header = ["SERVICE", "NAME", "STATUS", "ID"];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

  const formatRow = (cells: string[]) => cells.map((cell, i) => cell.padEnd(widths[i])).join("  ");
  log(formatRow(header));
  for (const row of rows) log(formatRow(row));
}
