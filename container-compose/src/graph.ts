import type { ComposeService } from "./types.js";

export class DependencyCycleError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular depends_on detected: ${cycle.join(" -> ")}`);
    this.name = "DependencyCycleError";
  }
}

export class UnknownDependencyError extends Error {
  constructor(public readonly service: string, public readonly missing: string) {
    super(`Service '${service}' depends_on unknown service '${missing}'`);
    this.name = "UnknownDependencyError";
  }
}

/** Kahn's algorithm — returns services ordered so every dependency comes before its dependents. */
export function topologicalOrder(services: ComposeService[]): ComposeService[] {
  const byName = new Map(services.map((s) => [s.name, s]));
  for (const service of services) {
    for (const dep of service.dependsOn) {
      if (!byName.has(dep)) throw new UnknownDependencyError(service.name, dep);
    }
  }

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const service of services) {
    inDegree.set(service.name, service.dependsOn.length);
    for (const dep of service.dependsOn) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), service.name]);
    }
  }

  const queue: string[] = services.filter((s) => (inDegree.get(s.name) ?? 0) === 0).map((s) => s.name);
  const ordered: ComposeService[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift()!;
    if (visited.has(name)) continue;
    visited.add(name);
    ordered.push(byName.get(name)!);
    for (const dependent of dependents.get(name) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, remaining);
      if (remaining === 0) queue.push(dependent);
    }
  }

  if (ordered.length !== services.length) {
    const stuck = services.map((s) => s.name).filter((n) => !visited.has(n));
    throw new DependencyCycleError(stuck);
  }

  return ordered;
}
