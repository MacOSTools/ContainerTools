import { execFile } from "node:child_process";

const CONTAINER_BIN = process.env.CONTAINER_BIN || "container";
const DEFAULT_TIMEOUT_MS = 120_000;

export class ContainerCliError extends Error {
  constructor(
    public readonly args: string[],
    public readonly exitCode: number | null,
    public readonly stdout: string,
    public readonly stderr: string
  ) {
    super(
      `container ${args.join(" ")} failed (exit ${exitCode}): ${stderr.trim() || stdout.trim() || "no output"}`
    );
    this.name = "ContainerCliError";
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

interface ExecFileError extends Error {
  code?: number | string;
  killed?: boolean;
  signal?: string | null;
}

/** Runs the `container` binary with the given arguments and returns stdout/stderr. */
export function runContainer(args: string[], timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      CONTAINER_BIN,
      args,
      { timeout: timeoutMs, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as ExecFileError;
          if (err.killed) {
            reject(new ContainerTimeoutError(args, timeoutMs));
            return;
          }
          const exitCode = typeof err.code === "number" ? err.code : null;
          reject(new ContainerCliError(args, exitCode, stdout, stderr));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

export class ContainerTimeoutError extends Error {
  constructor(public readonly args: string[], public readonly timeoutMs: number) {
    super(`container ${args.join(" ")} timed out after ${timeoutMs}ms`);
    this.name = "ContainerTimeoutError";
  }
}

/** Runs a `container` subcommand that supports `--format json` and parses the result. */
export async function runContainerJson<T>(args: string[], timeoutMs?: number): Promise<T> {
  const { stdout } = await runContainer([...args, "--format", "json"], timeoutMs);
  const trimmed = stdout.trim();
  if (!trimmed) {
    return [] as unknown as T;
  }
  return JSON.parse(trimmed) as T;
}

/** Turns a caught error into a clear, actionable message for the tool response. */
export function describeError(error: unknown): string {
  if (error instanceof ContainerCliError) {
    let hint = "";
    if (/apiserver is not running|Plugins? (is|are) unavailable|not registered with launchd/i.test(error.stderr)) {
      hint = " Hint: the container system service isn't running — call container_system_start first.";
    } else if (/no such image|not found/i.test(error.stderr)) {
      hint = " Hint: check the image reference or container ID is correct, and that it has been pulled/created.";
    }
    return `Error: ${error.message}${hint}`;
  }
  if (error instanceof ContainerTimeoutError) {
    return `Error: ${error.message}. For long-running processes, run with detach=true instead of waiting on foreground output.`;
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return `Error: unexpected error: ${String(error)}`;
}
