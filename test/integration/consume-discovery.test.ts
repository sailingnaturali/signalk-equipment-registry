import { describe, it, expect } from 'vitest';
import { execSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';

const REPO = resolve(__dirname, '..', '..');
const SIGNALK = resolve(REPO, '..', 'signalk-server');
const RUN = process.env.SK_INTEGRATION === '1' && existsSync(join(SIGNALK, 'bin', 'signalk-server'));

async function freePort(): Promise<number> {
  return new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = (s.address() as net.AddressInfo).port; s.close(() => res(p)); }); });
}

describe.skipIf(!RUN)('consumeDiscovery integration', () => {
  it('overlays the virtual device identity onto the served registry', async () => {
    execSync('npm run build', { cwd: REPO });
    const port = await freePort();
    const cfg = mkdtempSync(join(tmpdir(), 'eqreg-cfg-'));
    mkdirSync(join(cfg, 'node_modules', '@sailingnaturali'), { recursive: true });
    symlinkSync(REPO, join(cfg, 'node_modules', '@sailingnaturali', 'signalk-equipment-registry'));
    const declared = { 'propulsion.port': { equipment_id: 'oceanvolt-hpsp25', manufacturer: 'Oceanvolt', model: 'HighPower ServoProp 25', serial: null, instance: 'port', category: 'propulsion', source: 'declared', paths: [{ path: 'propulsion.port.temperature', measurement: 'temperature' }] } };
    writeFileSync(join(cfg, 'declared.json'), JSON.stringify(declared));
    mkdirSync(join(cfg, 'plugin-config-data'), { recursive: true });
    writeFileSync(join(cfg, 'plugin-config-data', 'signalk-equipment-registry.json'),
      JSON.stringify({ enabled: true, configuration: { registryPath: join(cfg, 'declared.json'), consumeDiscovery: true, publishToDataModel: true } }));
    const emitter = join(REPO, 'test', 'harness', 'virtual_n2k_device.js');
    const nm = join(SIGNALK, 'node_modules');
    writeFileSync(join(cfg, 'settings.json'), JSON.stringify({
      interfaces: {},
      pipedProviders: [{ id: 'virtual-n2k', enabled: true, pipeElements: [
        { type: 'providers/execute', options: { command: `env NODE_PATH=${nm} node ${emitter}` } },
        { type: 'providers/liner', options: {} },
        { type: 'providers/canboatjs', options: {} },
        { type: 'providers/n2k-signalk', options: {} },
      ] }],
    }));
    const proc = spawn('node', [join(SIGNALK, 'bin', 'signalk-server'), '-s', 'settings.json'], {
      cwd: SIGNALK, env: { ...process.env, SIGNALK_NODE_CONFIG_DIR: cfg, PORT: String(port), NODE_PATH: nm },
      stdio: 'pipe',
    });
    const log: string[] = []; proc.stdout!.on('data', (d) => log.push(d.toString())); proc.stderr!.on('data', (d) => log.push(d.toString()));
    try {
      const base = `http://localhost:${port}`;
      let entry: Record<string, unknown> | undefined;
      for (let i = 0; i < 60; i++) {
        if (proc.exitCode !== null) throw new Error('server exited:\n' + log.slice(-20).join(''));
        try {
          const r = await fetch(`${base}/signalk/v2/api/resources/equipment`);
          if (r.ok) { const reg = await r.json() as Record<string, Record<string, unknown>>; const e = reg['propulsion.port']; if (e && e.serial) { entry = e; break; } }
        } catch { /* not up yet */ }
        await new Promise((res) => setTimeout(res, 1000));
      }
      expect(entry, 'served registry never gained a discovered serial:\n' + log.slice(-20).join('')).toBeTruthy();
      expect(entry!.equipment_id).toBe('oceanvolt-hpsp25');
      expect(entry!.serial).toBeTruthy();
    } finally {
      proc.kill('SIGTERM');
    }
  }, 90_000);
});
