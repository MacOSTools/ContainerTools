/** Normalized, internal representation of a docker-compose.yml — after parsing away the
 *  Compose spec's many equivalent shorthand forms (string|array, map|list, etc). */

export interface ComposeBuild {
  context: string;
  dockerfile?: string;
  args?: Record<string, string>;
  target?: string;
}

export interface ComposeService {
  name: string;
  image?: string;
  build?: ComposeBuild;
  containerName?: string;
  command?: string[];
  entrypoint?: string[];
  environment: string[]; // "KEY=VALUE" entries, host-inherited "KEY" entries resolved already
  ports: string[]; // passthrough to `container run --publish`
  volumes: string[]; // passthrough to `container run --volume`, named volumes rewritten to bind paths
  dependsOn: string[];
  workingDir?: string;
  networks: string[]; // resolved network names this service attaches to (never empty)
  labels: string[]; // "KEY=VALUE"
  user?: string;
  capAdd: string[];
  capDrop: string[];
  readOnly: boolean;
  shmSize?: string;
  tmpfs: string[];
  platform?: string;
  cpus?: number;
  memory?: string;
  unsupportedFieldsUsed: string[]; // fields present in the YAML but not translated to any effect
}

export interface ComposeNetwork {
  name: string;
  internal: boolean;
  subnet?: string;
}

export interface ComposeVolume {
  name: string;
}

export interface ComposeProject {
  projectName: string;
  services: ComposeService[];
  networks: ComposeNetwork[];
  volumes: ComposeVolume[];
  sourceFile: string;
}
