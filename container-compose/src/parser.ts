import * as fs from "node:fs";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import type { ComposeBuild, ComposeNetwork, ComposeProject, ComposeService, ComposeVolume } from "./types.js";
import { defaultNetworkName, resolveProjectName, volumeName } from "./naming.js";

/** Fields the Compose Spec defines that this tool cannot translate, because the underlying
 *  `container` CLI has no equivalent (as of v1.0.0). Surfaced as warnings, never silently dropped. */
const UNSUPPORTED_SERVICE_FIELDS = [
  "restart",
  "healthcheck",
  "privileged",
  "deploy",
  "profiles",
  "secrets",
  "configs",
  "extends",
  "logging",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  return [String(value)];
}

/** Compose `environment` / `labels` accept either a map or a "KEY=VALUE" list. */
function toKeyValueArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (isRecord(value)) {
    return Object.entries(value).map(([k, v]) => (v == null ? k : `${k}=${v}`));
  }
  return [];
}

function parseEnvFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf8");
  const entries: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    entries.push(trimmed);
  }
  return entries;
}

function parseBuild(value: unknown, baseDir: string): ComposeBuild | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    return { context: path.resolve(baseDir, value) };
  }
  if (isRecord(value)) {
    const context = typeof value.context === "string" ? value.context : ".";
    const build: ComposeBuild = { context: path.resolve(baseDir, context) };
    if (typeof value.dockerfile === "string") build.dockerfile = value.dockerfile;
    if (typeof value.target === "string") build.target = value.target;
    if (value.args != null) {
      const args: Record<string, string> = {};
      if (Array.isArray(value.args)) {
        for (const entry of value.args) {
          const [k, ...rest] = String(entry).split("=");
          args[k] = rest.join("=");
        }
      } else if (isRecord(value.args)) {
        for (const [k, v] of Object.entries(value.args)) args[k] = String(v);
      }
      build.args = args;
    }
    return build;
  }
  return undefined;
}

/** Rewrites named-volume references ("myvol:/path") to their project-scoped volume name;
 *  leaves bind mounts (paths starting with . / / or ~) untouched aside from resolving relativity. */
function resolveVolumeEntry(entry: string, projectName: string, declaredVolumes: Set<string>, baseDir: string): string {
  const parts = entry.split(":");
  if (parts.length === 1) return entry; // anonymous volume, pass through untouched
  const [source, target, ...rest] = parts;
  const looksLikeBindPath = source.startsWith(".") || source.startsWith("/") || source.startsWith("~");
  if (looksLikeBindPath) {
    const resolvedSource = source.startsWith("~") ? source : path.resolve(baseDir, source);
    return [resolvedSource, target, ...rest].join(":");
  }
  if (declaredVolumes.has(source)) {
    return [volumeName(projectName, source), target, ...rest].join(":");
  }
  // Undeclared short name — Compose allows implicitly-declared volumes; scope it anyway.
  return [volumeName(projectName, source), target, ...rest].join(":");
}

function parseDependsOn(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (isRecord(value)) return Object.keys(value);
  return [];
}

export function parseComposeFile(
  filePath: string,
  options: { projectNameFlag?: string } = {}
): { project: ComposeProject; warnings: string[] } {
  const absPath = path.resolve(filePath);
  const baseDir = path.dirname(absPath);
  const raw = parseYaml(fs.readFileSync(absPath, "utf8")) as Record<string, unknown>;
  const warnings: string[] = [];

  const projectName = resolveProjectName({
    flag: options.projectNameFlag,
    env: process.env.COMPOSE_PROJECT_NAME,
    fileField: typeof raw.name === "string" ? raw.name : undefined,
    composeFilePath: absPath,
  });

  // --- top-level volumes ---
  const rawVolumes = isRecord(raw.volumes) ? raw.volumes : {};
  const declaredVolumeNames = new Set(Object.keys(rawVolumes));
  const volumes: ComposeVolume[] = Object.keys(rawVolumes).map((name) => ({ name: volumeName(projectName, name) }));

  // --- top-level networks ---
  const rawNetworks = isRecord(raw.networks) ? raw.networks : {};
  const networks: ComposeNetwork[] = Object.entries(rawNetworks).map(([name, def]) => {
    const d = isRecord(def) ? def : {};
    const ipamConfig = isRecord(d.ipam) && Array.isArray((d.ipam as Record<string, unknown>).config)
      ? ((d.ipam as Record<string, unknown>).config as unknown[])
      : [];
    const subnet = isRecord(ipamConfig[0]) ? (ipamConfig[0] as Record<string, unknown>).subnet : undefined;
    return {
      name: `${projectName}_${name}`,
      internal: d.internal === true,
      subnet: typeof subnet === "string" ? subnet : undefined,
    };
  });
  const hasDefaultNetworkAlready = networks.some((n) => n.name === defaultNetworkName(projectName));
  if (!hasDefaultNetworkAlready) {
    networks.push({ name: defaultNetworkName(projectName), internal: false });
  }

  // --- services ---
  const rawServices = isRecord(raw.services) ? raw.services : {};
  const services: ComposeService[] = Object.entries(rawServices).map(([serviceName, defUnknown]) => {
    const def = isRecord(defUnknown) ? defUnknown : {};
    const unsupportedUsed = UNSUPPORTED_SERVICE_FIELDS.filter((f) => def[f] !== undefined);

    let environment = toKeyValueArray(def.environment);
    const envFiles = toStringArray(def.env_file).map((f) => path.resolve(baseDir, f));
    const envFileEntries = envFiles.flatMap((f) => parseEnvFile(f));
    // env_file entries first, explicit `environment` entries override (matches Compose precedence).
    environment = [...envFileEntries, ...environment];

    const serviceNetworksRaw = def.networks;
    let serviceNetworks: string[];
    if (serviceNetworksRaw == null) {
      serviceNetworks = [defaultNetworkName(projectName)];
    } else if (Array.isArray(serviceNetworksRaw)) {
      serviceNetworks = serviceNetworksRaw.map((n) => `${projectName}_${n}`);
    } else if (isRecord(serviceNetworksRaw)) {
      serviceNetworks = Object.keys(serviceNetworksRaw).map((n) => `${projectName}_${n}`);
    } else {
      serviceNetworks = [defaultNetworkName(projectName)];
    }

    const volumesEntries = toStringArray(def.volumes).map((v) =>
      resolveVolumeEntry(v, projectName, declaredVolumeNames, baseDir)
    );

    const service: ComposeService = {
      name: serviceName,
      image: typeof def.image === "string" ? def.image : undefined,
      build: parseBuild(def.build, baseDir),
      containerName: typeof def.container_name === "string" ? def.container_name : undefined,
      command: def.command != null ? toStringArray(def.command) : undefined,
      entrypoint: def.entrypoint != null ? toStringArray(def.entrypoint) : undefined,
      environment,
      ports: toStringArray(def.ports),
      volumes: volumesEntries,
      dependsOn: parseDependsOn(def.depends_on),
      workingDir: typeof def.working_dir === "string" ? def.working_dir : undefined,
      networks: serviceNetworks,
      labels: toKeyValueArray(def.labels),
      user: typeof def.user === "string" ? def.user : undefined,
      capAdd: toStringArray(def.cap_add),
      capDrop: toStringArray(def.cap_drop),
      readOnly: def.read_only === true,
      shmSize: typeof def.shm_size === "string" ? def.shm_size : undefined,
      tmpfs: toStringArray(def.tmpfs),
      platform: typeof def.platform === "string" ? def.platform : undefined,
      cpus: typeof def.cpus === "number" ? def.cpus : undefined,
      memory: typeof def.mem_limit === "string" ? def.mem_limit : undefined,
      unsupportedFieldsUsed: unsupportedUsed,
    };

    if (!service.image && !service.build) {
      warnings.push(`Service '${serviceName}' has neither 'image' nor 'build' — it will fail to run.`);
    }
    for (const field of unsupportedUsed) {
      warnings.push(
        `Service '${serviceName}' sets '${field}', which has no equivalent in Apple's container CLI and will be ignored.`
      );
    }

    return service;
  });

  return {
    project: { projectName, services, networks, volumes, sourceFile: absPath },
    warnings,
  };
}
