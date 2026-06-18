import { Registry } from './registry';

export interface IdentityDelta {
  path: string;
  value: string;
}

const IDENTITY_FIELDS = ['manufacturer', 'model', 'serial'] as const;

// Flatten each registry entry's identity into data-model deltas keyed by the
// instance id (e.g. "propulsion.port.model"). Null/empty fields are skipped, so
// a blank serial produces no row.
export function identityDeltas(registry: Registry): IdentityDelta[] {
  const out: IdentityDelta[] = [];
  for (const [instanceId, entry] of Object.entries(registry)) {
    for (const field of IDENTITY_FIELDS) {
      const value = entry[field];
      if (typeof value === 'string' && value.length > 0) {
        out.push({ path: `${instanceId}.${field}`, value });
      }
    }
  }
  return out;
}
