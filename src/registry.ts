import { readFileSync } from 'node:fs';

export interface RegistryPathBinding {
  path: string;
  measurement: string;
}

export interface RegistryEntry {
  equipment_id: string | null;
  manufacturer: string;
  model: string;
  serial: string | null;
  instance: string;
  category: string;
  source: 'declared' | 'discovered';
  paths: RegistryPathBinding[];
  n2k?: { address?: number; canName?: string; manufacturerCode?: number };
}

export type Registry = Record<string, RegistryEntry>;

const REQUIRED: (keyof RegistryEntry)[] = [
  'manufacturer', 'model', 'instance', 'category', 'source', 'paths',
];

// Read and shallow-validate the registry JSON. A missing file is not an error
// (the registry is simply empty); a malformed entry is — fail loud so a bad
// deploy is caught, not silently served.
export function readRegistryFile(path: string): Registry {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return {};
  }
  const parsed = JSON.parse(raw) as Registry;
  for (const [id, entry] of Object.entries(parsed)) {
    for (const field of REQUIRED) {
      if (entry[field] === undefined) {
        throw new Error(`equipment registry entry '${id}' missing required field '${field}'`);
      }
    }
  }
  return parsed;
}
