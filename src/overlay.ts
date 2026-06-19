import { Registry } from './registry';
import { Identity, instanceOf } from './discovery';

// Lean overlay (NOT the full SP3 reconcile — path-union/conflict logic is core's
// job later). Declared always wins identity; discovered fills instances declared
// lacks and fills an empty declared serial.
export function overlay(declared: Registry, discovered: Record<string, Identity>): Registry {
  const served: Registry = {};
  for (const [iid, e] of Object.entries(declared)) served[iid] = { ...e };
  for (const [iid, id] of Object.entries(discovered)) {
    const existing = served[iid];
    if (!existing) {
      served[iid] = {
        equipment_id: null,
        manufacturer: id.manufacturer,
        model: id.model,
        serial: id.serial,
        instance: instanceOf(iid)[1],
        category: null,
        source: 'discovered',
        paths: [],
      };
    } else if (!existing.serial && id.serial) {
      served[iid] = { ...existing, serial: id.serial };
    }
  }
  return served;
}
