import { Plugin, ServerAPI } from '@signalk/server-api';
import { join } from 'node:path';
import { readRegistryFile, Registry } from './registry';

interface Options {
  registryPath?: string;
}

export = function (app: ServerAPI): Plugin {
  let registry: Registry = {};

  const plugin: Plugin = {
    id: 'signalk-equipment-registry',
    name: 'Equipment Registry',
    description:
      'Serves a vessel equipment registry (manufacturer/model/serial per installed instance) at resources/equipment.',
    schema: {
      type: 'object',
      properties: {
        registryPath: {
          type: 'string',
          title: 'Path to equipment-registry.json',
          description:
            'Absolute path, or relative to the SignalK data directory. Defaults to <dataDir>/equipment-registry.json.',
        },
      },
    },

    start(options: Options) {
      const filePath = options.registryPath ??
        join(app.getDataDirPath(), 'equipment-registry.json');
      registry = readRegistryFile(filePath);
      app.debug('equipment registry loaded: %d instances from %s',
        Object.keys(registry).length, filePath);

      // Served at /signalk/v2/api/resources/equipment, anonymously readable
      // under allow_readonly (the data API), like signalk-currents. A
      // registerWithRouter /plugins/<id> route would be admin-gated — wrong
      // mechanism here.
      app.registerResourceProvider({
        type: 'equipment',
        methods: {
          async listResources() {
            return registry as unknown as Record<string, unknown>;
          },
          getResource(): never { throw new Error('Not implemented'); },
          setResource(): never { throw new Error('Not implemented'); },
          deleteResource(): never { throw new Error('Not implemented'); },
        },
      });
    },

    stop() {
      registry = {};
    },
  };

  return plugin;
};
