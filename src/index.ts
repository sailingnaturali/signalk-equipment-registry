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

// ServerAPI's types omit app.signalk; declare the bits we use. It is the
// FullSignalK model: an EventEmitter that fires 'delta' per accepted delta,
// and exposes `.self` (the full self-vessel tree). We need both because:
//  - n2kSourceMetadata fires only on the n2k-signalk stream's internal mapper;
//    it lands source identity in the sources tree but is NOT re-emitted on the
//    app bus (verified against signalk-server 2.28), so the delta bus is our
//    "something changed" trigger.
//  - getSelfPath('') returns undefined (lodash _.get with an empty path) and
//    getPath('vessels.self') returns {} (retrieve() keys vessels by uuid, no
//    self alias), so app.signalk.self is the only accessor that yields the full
//    self tree in-process. See docs/core-discovery-gaps.md.
interface FullSignalK {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
  self: Record<string, unknown>;
}
interface DiscoveryApp extends ServerAPI {
  signalk: FullSignalK;
}

export = function (app: ServerAPI): Plugin {
  let declared: Registry = {};
  let served: Registry = {};
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let onUpdate: (() => void) | undefined;

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
              (app as DiscoveryApp).signalk?.self ?? {},
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
        // Re-read the server-assembled sources tree whenever deltas flow. Core
        // populates each source's n2k identity (manufacturer/model/serial) into
        // that tree as it discovers devices, but never re-emits it on the app
        // bus — so we use the delta bus as a "something changed" trigger and
        // re-derive. Throttled (not debounced): on a live bus deltas arrive
        // faster than any debounce window, so resetting the timer each time
        // would starve it forever. Instead schedule one trailing recompute and
        // ignore further updates until it fires — at most one recompute/second.
        onUpdate = () => {
          if (debounce) return;
          debounce = setTimeout(() => {
            debounce = undefined;
            recompute();
          }, 1000);
        };
        (app as DiscoveryApp).signalk.on('delta', onUpdate);
        app.debug('consumeDiscovery on — re-deriving on delta bus updates');
      }
    },

    stop() {
      clearTimeout(debounce);
      if (onUpdate) {
        (app as DiscoveryApp).signalk.removeListener('delta', onUpdate);
        onUpdate = undefined;
      }
      declared = {};
      served = {};
    },
  };

  return plugin;
};
