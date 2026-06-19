import { describe, it, expect } from 'vitest';
import { instanceOf, pathsBySource, discoveredFromSources } from '../src/discovery';

describe('instanceOf', () => {
  it('keys 2-segment and 3-segment families', () => {
    expect(instanceOf('propulsion.port.temperature')).toEqual(['propulsion.port', 'port']);
    expect(instanceOf('electrical.batteries.house.voltage')).toEqual(['electrical.batteries.house', 'house']);
    expect(instanceOf('tanks.fuel.0.currentLevel')).toEqual(['tanks.fuel.0', '0']);
  });
});

describe('pathsBySource', () => {
  it('groups leaf paths by $source, skips notifications', () => {
    const self = {
      uuid: 'x',
      propulsion: { port: { temperature: { value: 1, $source: 'n2k.22' } } },
      notifications: { propulsion: { port: { temperature: { value: { state: 'alarm' }, $source: 'n2k.22' } } } },
    };
    expect(pathsBySource(self)).toEqual({ 'n2k.22': ['propulsion.port.temperature'] });
  });
});

describe('discoveredFromSources', () => {
  it('maps device identity to the instances it feeds', () => {
    const sources = { 'n2k': { '22': { n2k: { manufacturerCode: 847, modelId: 'ServoProp 25', modelSerialCode: 'BUS-9' } } } };
    const self = { propulsion: { port: { temperature: { value: 1, $source: 'n2k.22' } } } };
    expect(discoveredFromSources(sources, self)).toEqual({
      'propulsion.port': { manufacturer: 'Oceanvolt', model: 'ServoProp 25', serial: 'BUS-9' },
    });
  });

  it('passes a string manufacturerCode through as the name', () => {
    const sources = { bus: { '3': { n2k: { manufacturerCode: 'Victron Energy', modelId: 'Cerbo GX', modelSerialCode: null } } } };
    const self = { electrical: { batteries: { house: { voltage: { value: 12, $source: 'bus.3' } } } } };
    const out = discoveredFromSources(sources, self);
    expect(out['electrical.batteries.house']).toEqual({ manufacturer: 'Victron Energy', model: 'Cerbo GX', serial: null });
  });
});
