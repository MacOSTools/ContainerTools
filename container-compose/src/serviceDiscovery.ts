import { runContainer } from "./containerCli.js";

interface InspectNetwork {
  ipv4Address?: string;
  network?: string;
}

interface InspectedContainer {
  networks?: InspectNetwork[];
  status?: { networks?: InspectNetwork[] };
}

/** Apple's `container` gives every container a real IP on its network(s), but — unlike Docker's
 *  user-defined bridge networks — provides no embedded DNS to resolve other containers by name.
 *  This patches /etc/hosts in every started container with the other services' names -> IPs, so
 *  code written against normal Compose service-name resolution ("redis", "db", ...) keeps working. */
export async function wireServiceDiscovery(
  containerNames: string[],
  log: (msg: string) => void
): Promise<void> {
  const ipByName = new Map<string, string>();

  for (const name of containerNames) {
    const ip = await getContainerIp(name);
    if (ip) ipByName.set(name, ip);
  }

  if (ipByName.size < 2) return; // nothing to wire up

  for (const name of containerNames) {
    const others = [...ipByName.entries()].filter(([n]) => n !== name);
    if (others.length === 0) continue;
    const hostsLines = others.map(([otherName, ip]) => `${ip}\t${serviceAlias(otherName)}`).join("\n");
    const script = `printf '%s\\n' ${shellQuote(hostsLines)} >> /etc/hosts`;
    try {
      await runContainer(["exec", name, "sh", "-c", script], 15_000);
    } catch {
      log(`Warning: could not patch /etc/hosts in '${name}' for service-name resolution (no /bin/sh in this image?).`);
    }
  }
}

/** Container names are "<project>-<service>-1" — the alias other services should resolve is
 *  just the service name, matching Compose's DNS behavior. */
function serviceAlias(containerName: string): string {
  const match = containerName.match(/^.+-(.+)-\d+$/);
  return match ? match[1] : containerName;
}

async function getContainerIp(name: string): Promise<string | undefined> {
  try {
    const { stdout } = await runContainer(["inspect", name], 15_000);
    const parsed = JSON.parse(stdout.trim()) as InspectedContainer[];
    const networks = parsed[0]?.status?.networks ?? parsed[0]?.networks ?? [];
    const address = networks[0]?.ipv4Address;
    return address?.split("/")[0];
  } catch {
    return undefined;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
