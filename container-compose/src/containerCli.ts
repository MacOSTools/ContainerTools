import { execFile, spawn, type ChildProcess } from "node:child_process";

const CONTAINER_BIN = process.env.CONTAINER_BIN || "container";

export class ContainerCliError extends Error {
  constructor(public readonly args: string[], public readonly stdout: string, public readonly stderr: string) {
    super(`container ${args.join(" ")} failed: ${stderr.trim() || stdout.trim() || "no output"}`);
    this.name = "ContainerCliError";
  }
}

export function runContainer(args: string[], timeoutMs = 120_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(CONTAINER_BIN, args, { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new ContainerCliError(args, stdout, stderr));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export async function runContainerJson<T>(args: string[]): Promise<T> {
  const { stdout } = await runContainer([...args, "--format", "json"]);
  const trimmed = stdout.trim();
  if (!trimmed) return [] as unknown as T;
  return JSON.parse(trimmed) as T;
}

/** Spawns a long-lived `container` subprocess (e.g. `logs --follow`) without waiting for exit. */
export function spawnContainer(args: string[]): ChildProcess {
  return spawn(CONTAINER_BIN, args, { stdio: ["ignore", "pipe", "pipe"] });
}

export async function containerSystemIsRunning(): Promise<boolean> {
  try {
    await runContainer(["system", "status"], 10_000);
    return true;
  } catch {
    return false;
  }
}

interface NamedResource {
  id?: string;
  configuration?: { name?: string };
}

function resourceName(resource: NamedResource): string | undefined {
  return resource.configuration?.name ?? resource.id;
}

export async function ensureNetwork(name: string, opts: { internal?: boolean; subnet?: string } = {}): Promise<void> {
  const existing = await runContainerJson<NamedResource[]>(["network", "list"]).catch(() => []);
  if (existing.some((n) => resourceName(n) === name)) return;
  const args = ["network", "create"];
  if (opts.internal) args.push("--internal");
  if (opts.subnet) args.push("--subnet", opts.subnet);
  args.push(name);
  await runContainer(args, 30_000);
}

export async function ensureVolume(name: string): Promise<void> {
  const existing = await runContainerJson<NamedResource[]>(["volume", "list"]).catch(() => []);
  if (existing.some((v) => resourceName(v) === name)) return;
  await runContainer(["volume", "create", name], 30_000);
}

export async function removeNetworkIfExists(name: string): Promise<void> {
  await runContainer(["network", "delete", name], 15_000).catch(() => undefined);
}

export async function removeVolumeIfExists(name: string): Promise<void> {
  await runContainer(["volume", "delete", name], 15_000).catch(() => undefined);
}
