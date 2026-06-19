// Lean TS port of the SP2 source→instance identity linkage (vessel-knowledge-mcp
// discovery/{n2k_sources,seed}.py). It exists in the plugin only because core
// does not expose discovered identity keyed by SignalK instance in-process — see
// docs/core-discovery-gaps.md. Identity-only (no vault matching, no reconcile).

export interface Identity {
  manufacturer: string | null;
  model: string | null;
  serial: string | null;
}

const MANUFACTURER_CODES: Record<number, string> = { 358: 'Victron Energy', 847: 'Oceanvolt' };

const THREE_SEGMENT_PREFIXES = [
  'electrical.batteries.', 'electrical.inverters.', 'electrical.chargers.',
  'electrical.solar.', 'electrical.alternators.', 'tanks.',
];

export function instanceOf(path: string): [string, string] {
  const parts = path.split('.');
  if (parts.length < 2) return [path, path];
  if (THREE_SEGMENT_PREFIXES.some((p) => path.startsWith(p)) && parts.length >= 3) {
    return [parts.slice(0, 3).join('.'), parts[2]];
  }
  return [`${parts[0]}.${parts[1]}`, parts[1]];
}

const LEAF_KEYS = new Set(['value', '$source', 'timestamp', 'values', 'meta', 'pgn', 'sentence']);
const SELF_SKIP = new Set(['uuid', 'name', 'mmsi', 'type', 'url', 'version', '$source', 'communication', 'notifications']);

export function pathsBySource(self: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const walk = (node: unknown, prefix: string): void => {
    if (typeof node !== 'object' || node === null) return;
    const rec = node as Record<string, unknown>;
    if (typeof rec.$source === 'string') {
      (out[rec.$source] ??= []).push(prefix);
      return;
    }
    for (const [k, v] of Object.entries(rec)) {
      if (LEAF_KEYS.has(k)) continue;
      walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  for (const [k, v] of Object.entries(self)) {
    if (SELF_SKIP.has(k)) continue;
    walk(v, k);
  }
  return out;
}

interface Device { sourceRef: string; identity: Identity; }

function parseDevices(sources: Record<string, unknown>): Device[] {
  const devices: Device[] = [];
  for (const [label, srcs] of Object.entries(sources)) {
    if (typeof srcs !== 'object' || srcs === null) continue;
    for (const [key, sub] of Object.entries(srcs as Record<string, unknown>)) {
      if (typeof sub !== 'object' || sub === null) continue;
      const n2k = (sub as Record<string, unknown>).n2k as Record<string, unknown> | undefined;
      if (!n2k || n2k.manufacturerCode == null) continue;
      const raw = n2k.manufacturerCode;
      const manufacturer = typeof raw === 'string' ? raw : (MANUFACTURER_CODES[raw as number] ?? null);
      devices.push({
        sourceRef: `${label}.${key}`,
        identity: {
          manufacturer,
          model: (n2k.modelId as string) ?? null,
          serial: (n2k.modelSerialCode as string) ?? null,
        },
      });
    }
  }
  return devices;
}

export function discoveredFromSources(
  sources: Record<string, unknown>,
  self: Record<string, unknown>,
): Record<string, Identity> {
  const pbs = pathsBySource(self);
  const out: Record<string, Identity> = {};
  for (const dev of parseDevices(sources)) {
    for (const path of pbs[dev.sourceRef] ?? []) {
      const [instanceId] = instanceOf(path);
      out[instanceId] = dev.identity;
    }
  }
  return out;
}
