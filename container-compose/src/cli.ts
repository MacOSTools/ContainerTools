#!/usr/bin/env node
import * as fs from "node:fs";
import { Command } from "commander";
import { parseComposeFile } from "./parser.js";
import { up } from "./commands/up.js";
import { down } from "./commands/down.js";
import { ps } from "./commands/ps.js";
import { logs } from "./commands/logs.js";
import { buildProject } from "./commands/build.js";
import { printConfig } from "./commands/config.js";
import { ContainerCliError } from "./containerCli.js";
import { DependencyCycleError, UnknownDependencyError } from "./graph.js";

const DEFAULT_FILE_CANDIDATES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"];

function findDefaultComposeFile(): string {
  for (const candidate of DEFAULT_FILE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No compose file found (looked for ${DEFAULT_FILE_CANDIDATES.join(", ")}). Pass one explicitly with --file.`
  );
}

function loadProject(fileOpt: string | undefined, projectNameOpt: string | undefined) {
  const file = fileOpt ?? findDefaultComposeFile();
  const { project, warnings } = parseComposeFile(file, { projectNameFlag: projectNameOpt });
  for (const warning of warnings) console.error(`Warning: ${warning}`);
  return project;
}

function log(msg: string): void {
  console.log(msg);
}

function handleError(error: unknown): never {
  if (error instanceof ContainerCliError || error instanceof DependencyCycleError || error instanceof UnknownDependencyError) {
    console.error(`Error: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Error: ${String(error)}`);
  }
  process.exitCode = 1;
  return undefined as never;
}

const program = new Command();
program
  .name("container-compose")
  .description("Run standard docker-compose.yml files on top of Apple's `container` tool")
  .version("1.0.0")
  .option("-f, --file <path>", "Compose file to use (default: auto-detect compose.yaml/docker-compose.yml)")
  .option("-p, --project-name <name>", "Project name (default: derived from the compose file's directory)");

program
  .command("up")
  .description("Create networks/volumes, build/pull images, and start all services in dependency order")
  .option("-d, --detach", "Run in the background instead of streaming logs", false)
  .action(async (cmdOpts) => {
    const opts = program.opts();
    try {
      const project = loadProject(opts.file, opts.projectName);
      await up(project, { detach: !!cmdOpts.detach }, log);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("down")
  .description("Stop and remove all containers and networks for this project")
  .option("-v, --volumes", "Also remove named volumes", false)
  .action(async (cmdOpts) => {
    const opts = program.opts();
    try {
      const project = loadProject(opts.file, opts.projectName);
      await down(project, { removeVolumes: !!cmdOpts.volumes, removeNetworks: true }, log);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("ps")
  .description("List this project's containers")
  .action(async () => {
    const opts = program.opts();
    try {
      const project = loadProject(opts.file, opts.projectName);
      await ps(project, log);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("logs")
  .description("Fetch logs for one service, or all services if omitted")
  .argument("[service]")
  .option("-f, --follow", "Stream new log output", false)
  .option("-n, --tail <lines>", "Number of lines to show from the end of the logs", (v) => parseInt(v, 10))
  .action(async (service, cmdOpts) => {
    const opts = program.opts();
    try {
      const project = loadProject(opts.file, opts.projectName);
      await logs(project, { service, follow: !!cmdOpts.follow, tail: cmdOpts.tail }, log);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("build")
  .description("Build images for services that define a 'build' step, without starting anything")
  .action(async () => {
    const opts = program.opts();
    try {
      const project = loadProject(opts.file, opts.projectName);
      await buildProject(project, log);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("config")
  .description("Print the fully resolved project plan as JSON, without touching the container system")
  .action(() => {
    const opts = program.opts();
    try {
      const project = loadProject(opts.file, opts.projectName);
      printConfig(project, log);
    } catch (error) {
      handleError(error);
    }
  });

program.parseAsync(process.argv);
