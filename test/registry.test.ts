import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readRegistryFile } from '../src/registry';

function tmpFile(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'eqreg-'));
  const p = join(dir, 'equipment-registry.json');
  writeFileSync(p, contents);
  return p;
}

const VALID = {
  'propulsion.port': {
    equipment_id: 'oceanvolt-hpsp25', manufacturer: 'Oceanvolt',
    model: 'HighPower ServoProp 25', serial: null, instance: 'port',
    category: 'propulsion', source: 'declared',
    paths: [{ path: 'propulsion.port.temperature', measurement: 'temperature' }],
  },
};

describe('readRegistryFile', () => {
  it('loads a valid registry file', () => {
    const reg = readRegistryFile(tmpFile(JSON.stringify(VALID)));
    expect(reg['propulsion.port'].manufacturer).toBe('Oceanvolt');
  });

  it('returns {} for a missing file', () => {
    expect(readRegistryFile('/no/such/file.json')).toEqual({});
  });

  it('throws on an entry missing a required field', () => {
    const bad = { 'propulsion.port': { manufacturer: 'Oceanvolt' } };
    expect(() => readRegistryFile(tmpFile(JSON.stringify(bad)))).toThrow(/missing required field/);
  });
});
