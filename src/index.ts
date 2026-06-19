import { Plugin, ServerAPI, Path } from '@signalk/server-api';
import { join } from 'node:path';
import { readRegistryFile, Registry } from './registry';
import { identityDeltas } from './identity';
import { discoveredFromSources, Identity } from './discovery';
import { overlay } from './overlay';

interface Options {
  registryPath?: string;
  publishToDataModel?: boolean;
  consumeDiscovery?: boolean;
}

// ServerAPI's types omit the event-bus methods; declare the bits we use.
interface DiscoveryApp extends ServerAPI {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

export = function (app: ServerAPI): Plugin {
  let declared: Registry = {};
  let served: Registry = {};
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let onMetadata: (() => void) | undefined;

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
        publishToDataModel: {
          type: 'boolean',
          title: 'Publish equipment identity to the data model',
          description:
            'Also emit each instance\'s manufacturer/model/serial as SignalK data so it appears in the Data Browser (sourced to this plugin). Default on.',
          default: true,
        },
        consumeDiscovery: {
          type: 'boolean',
          title: 'Overlay core N2K discovery (beta)',
          description:
            'Overlay equipment identity discovered by the SignalK server (N2K) onto the declared registry — discovered fills gaps, declared wins. No-op without N2K devices. Default on (beta).',
          default: true,
        },
      },
    },

    start(options: Options) {
      const filePath = options.registryPath ??
        join(app.getDataDirPath(), 'equipment-registry.json');
      declared = readRegistryFile(filePath);
      app.debug('equipment registry loaded: %d declared instances from %s',
        Object.keys(declared).length, filePath);

      const publish = options.publishToDataModel !== false;

      const recompute = (): void => {
        const discovered: Record<string, Identity> = options.consumeDiscovery !== false
          ? discoveredFromSources(
              (app.getPath('sources') as Record<string, unknown>) ?? {},
              (app.getSelfPath('') as Record<string, unknown>) ?? {},
            )
          : {};
        served = overlay(declared, discovered);
        if (publish) {
          const values = identityDeltas(served).map((d) => ({ path: d.path as Path, value: d.value }));
          if (values.length > 0) app.handleMessage(plugin.id, { updates: [{ values }] });
        }
        app.debug('served %d instances (%d declared)',
          Object.keys(served).length, Object.keys(declared).length);
      };

      recompute();

      app.registerResourceProvider({
        type: 'equipment',
        methods: {
          async listResources() { return served as unknown as Record<string, unknown>; },
          getResource(): never { throw new Error('Not implemented'); },
          setResource(): never { throw new Error('Not implemented'); },
          deleteResource(): never { throw new Error('Not implemented'); },
        },
      });

      if (options.consumeDiscovery !== false) {
        // n2kSourceMetadata fires per identity PGN as core discovers devices; use
        // it as a trigger and re-read the server-assembled sources tree. Debounced
        // so a burst of address-claim/product-info PGNs coalesces into one refresh.
        onMetadata = () => {
          clearTimeout(debounce);
          debounce = setTimeout(recompute, 1000);
        };
        (app as DiscoveryApp).on('n2kSourceMetadata', onMetadata);
        app.debug('consumeDiscovery on — listening for n2kSourceMetadata');
      }
    },

    stop() {
      clearTimeout(debounce);
      if (onMetadata) {
        (app as DiscoveryApp).removeListener('n2kSourceMetadata', onMetadata);
        onMetadata = undefined;
      }
      declared = {};
      served = {};
    },
  };

  return plugin;
};
