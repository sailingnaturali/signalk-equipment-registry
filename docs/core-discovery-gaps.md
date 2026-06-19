# Core N2K discovery — gaps for an equipment-registry consumer

What this plugin had to do to consume signalk-server 2.28's N2K discovery, and where the
in-process integration was awkward. Findings are from actually building `consumeDiscovery`
against a live local server (2.28.0-beta.2) fed by a virtual N2K device — not speculation. Each
gap is a candidate change so plugins build *on* discovery instead of re-deriving or reaching into
internals.

## 1. Discovered identity is not delivered on the plugin event bus
`@signalk/n2k-signalk`'s mapper emits `n2kSourceMetadata` (per identity PGN: 60928 address-claim,
126996 product-info) on its **own** emitter and lands the assembled identity in the sources tree
via `deltaCache.setSourceDelta`. It is **not re-emitted on the app/plugin event bus**, so a plugin
`app.on('n2kSourceMetadata', …)` never fires. We had to trigger off the general `delta` bus
(`app.signalk.on('delta', …)`) — i.e. "something changed, go re-read the sources tree" — which is
indirect and fires on *all* data, not just identity changes.
**Ask:** emit an assembled discovered-identity event on the plugin-facing bus (e.g.
`equipmentDiscovered` / `n2kDeviceIdentity` with `{source, manufacturer, model, serial}`), or
re-emit `n2kSourceMetadata` there.

## 2. No in-process accessor for the full self tree
Mapping a discovered source to the SignalK instance it feeds needs the self tree's `$source`
linkage. But `app.getSelfPath('')` returns `undefined` (lodash `_.get` with an empty path) and
`app.getPath('vessels.self')` returns `{}` (the model keys vessels by uuid, with no `self`
alias — despite the `getSelfPath` doc example implying `vessels.self.<x>` works). The only
accessor that yields the full self tree in-process is the **undocumented** `app.signalk.self`,
which isn't on the `@signalk/server-api` `ServerAPI` type — we declare a local `FullSignalK`
interface to reach it.
**Ask:** a typed, documented accessor for the full self tree (e.g. `app.getSelfPath()` with no
arg, or `app.getSelf()`), exposed on `ServerAPI`.

## 3. No source→instance(/path) linkage from core
Even with identity (gap 1) and the self tree (gap 2), turning "source `n2k.22`" into
"`propulsion.port`" required reimplementing core's mapping: walk the self tree, group paths by
`$source`, derive the instance from the path (`src/discovery.ts`, ported from the
`vessel-knowledge-mcp` discovery code). n2k-signalk already computes this internally.
**Ask:** expose source→instance (and/or source→paths) so consumers don't reimplement it.

## 4. Instance aliases + conflict detection are admin-HTTP only
Operator-set instance labels (`sourceAliases`, PGN 130060) and instance-conflict detection live
behind `/skServer/*` (admin-gated) with no in-process event/API. A plugin can't reflect the
operator's chosen names or surface instance conflicts in the registry.
**Ask:** expose aliases + conflicts via an in-process event/API (or fold them into the gap-1
identity payload).

## 5. (Consequence) consumers re-derive on a coarse trigger
Because of gaps 1–3, the only robust plugin pattern today is: subscribe to the `delta` firehose,
throttle, and re-read + re-derive the whole registry (≤1×/sec). That re-publishes identity even
when nothing changed (bus noise for subscribers). A targeted identity event (gap 1) would let
consumers react only to real identity changes. (Tracked as a post-beta optimization in the plugin;
a dirty-check before re-publish is the stopgap.)

---

## Where this lands

With gaps 1–4 closed in core, this plugin's `src/discovery.ts` (the linkage port) and the
delta-bus/`app.signalk.self` workarounds retire. The plugin keeps only its real value: the
**declared / non-N2K equipment** layer and the **knowledge-vault linkage** (manuals, rated alarm
zones, service intervals) overlaid on core's discovered identity. Core owns auto-discovery →
identity; the plugin owns the manual + knowledge layer. This file is the evidence base for the
core-evolution spec.
