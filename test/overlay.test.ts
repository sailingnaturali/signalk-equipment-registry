import { describe, it, expect } from 'vitest';
import { overlay } from '../src/overlay';
import { Registry } from '../src/registry';

const DECLARED: Registry = {
  'propulsion.port': {
    equipment_id: 'oceanvolt-hpsp25', manufacturer: 'Oceanvolt', model: 'HighPower ServoProp 25',
    serial: null, instance: 'port', category: 'propulsion', source: 'declared',
    paths: [{ path: 'propulsion.port.temperature', measurement: 'temperature' }],
  },
};

describe('overlay', () => {
  it('fills an empty declared serial from discovered, keeps declared identity', () => {
    const out = overlay(DECLARED, { 'propulsion.port': { manufacturer: 'Oceanvolt', model: 'ServoProp 25', serial: 'BUS-9' } });
    expect(out['propulsion.port'].serial).toBe('BUS-9');
    expect(out['propulsion.port'].model).toBe('HighPower ServoProp 25'); // declared wins
    expect(out['propulsion.port'].source).toBe('declared');
  });

  it('adds a discovered-only instance as source=discovered', () => {
    const out = overlay({}, { 'electrical.batteries.house': { manufacturer: 'Victron Energy', model: 'Cerbo GX', serial: null } });
    const e = out['electrical.batteries.house'];
    expect(e.source).toBe('discovered');
    expect(e.equipment_id).toBeNull();
    expect(e.instance).toBe('house');
  });

  it('leaves declared untouched when discovered is empty', () => {
    expect(overlay(DECLARED, {})).toEqual(DECLARED);
  });

  it('does not overwrite a non-empty declared serial', () => {
    const declared = { 'propulsion.port': { ...DECLARED['propulsion.port'], serial: 'DECL' } };
    const out = overlay(declared, { 'propulsion.port': { manufacturer: 'x', model: 'y', serial: 'BUS-9' } });
    expect(out['propulsion.port'].serial).toBe('DECL');
  });
});
