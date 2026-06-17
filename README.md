# signalk-equipment-registry

Serve a vessel **equipment registry** — manufacturer / model / serial per installed
instance, plus the SignalK data paths each instance owns — as a SignalK resource at
`/signalk/v2/api/resources/equipment`.

SignalK's schema has rich *measurements* per instance (`propulsion.<x>.coolantTemperature`,
`electrical.batteries.<x>.voltage`, …) but **no slot for equipment identity** — what make/model
sits on a path, its serial number. This plugin adds that: a small JSON file declaring each
installed instance, served read-only over the resources API so any consumer (an AI agent,
a maintenance log, a display) can answer "what is the port engine, and what's its serial?"

It pairs with [`vessel-knowledge-mcp`](https://github.com/sailingnaturali/vessel-knowledge-mcp),
which reads this registry to resolve a notification path to a specific piece of equipment.

## How it serves

The registry is exposed via `registerResourceProvider`, so it is **anonymously readable under
`allow_readonly`** — the same access model as the rest of the SignalK data API. (A
`registerWithRouter` `/plugins/<id>` route would be admin-gated; wrong mechanism for data a
read-only client needs.) Only `listResources` is implemented today — it returns the whole
registry collection.

## Configuration

| Option | Default | Purpose |
|---|---|---|
| `registryPath` | `<dataDir>/equipment-registry.json` | Absolute path, or relative to the SignalK data directory, of the registry JSON file |

## Registry file format

A JSON object keyed by **instance id**; one entry per installed instance. Two engines of the
same model are two entries linking to the same `equipment_id`.

```json
{
  "propulsion.port": {
    "equipment_id": "oceanvolt-hpsp25",
    "manufacturer": "Oceanvolt",
    "model": "HighPower ServoProp 25",
    "serial": "OV-25-00412",
    "instance": "port",
    "category": "propulsion",
    "source": "declared",
    "paths": [
      { "path": "propulsion.port.temperature", "measurement": "temperature" },
      { "path": "propulsion.port.controllerTemperature", "measurement": "controllerTemperature" }
    ]
  }
}
```

| Field | Required | Notes |
|---|---|---|
| key (e.g. `propulsion.port`) | yes | instance id, unique in the collection |
| `manufacturer` / `model` / `category` | key required | may be `null` (e.g. a discovered-but-unidentified device) |
| `instance` | yes | SignalK instance key (`port`, `house`, `0`, …) |
| `source` | yes | provenance: `declared` \| `discovered` |
| `paths` | yes (may be empty) | `{ path, measurement }` bindings this instance owns |
| `equipment_id` | nullable | link to an external knowledge source (a vault card, a catalog) |
| `serial` | nullable | instance-specific |
| `n2k` | optional | reserved: `{ address, canName, manufacturerCode }` for N2K-discovery linkage |

A missing registry file is not an error — the registry is simply empty. A malformed entry
(missing a required field) throws at startup, so a bad deploy fails loud rather than serving
silently-wrong data.

## Install

    npm install @sailingnaturali/signalk-equipment-registry

Then enable it in the SignalK admin UI and point `registryPath` at your `equipment-registry.json`.

## License

MIT
