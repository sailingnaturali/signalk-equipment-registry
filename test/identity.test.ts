import { describe, it, expect } from 'vitest';
import { identityDeltas } from '../src/identity';
import { Registry } from '../src/registry';

const REG: Registry = {
  'propulsion.port': {
    equipment_id: 'oceanvolt-hpsp25', manufacturer: 'Oceanvolt',
    model: 'HighPower ServoProp 25', serial: 'OV-1', instance: 'port',
    category: 'propulsion', source: 'declared', paths: [],
  },
  'electrical.batteries.house': {
    equipment_id: 'victron-cerbo-gx', manufacturer: 'Victron Energy',
    model: 'Cerbo GX', serial: null, instance: 'house',
    category: 'electrical', source: 'declared', paths: [],
  },
};

describe('identityDeltas', () => {
  it('emits manufacturer/model/serial rows prefixed by instance id', () => {
    const out = identityDeltas(REG);
    const byPath = Object.fromEntries(out.map((d) => [d.path, d.value]));
    expect(byPath['propulsion.port.manufacturer']).toBe('Oceanvolt');
    expect(byPath['propulsion.port.model']).toBe('HighPower ServoProp 25');
    expect(byPath['propulsion.port.serial']).toBe('OV-1');
    expect(byPath['electrical.batteries.house.model']).toBe('Cerbo GX');
  });

  it('skips null/empty fields (no blank serial row)', () => {
    const paths = identityDeltas(REG).map((d) => d.path);
    expect(paths).not.toContain('electrical.batteries.house.serial');
  });

  it('returns [] for an empty registry', () => {
    expect(identityDeltas({})).toEqual([]);
  });
});
