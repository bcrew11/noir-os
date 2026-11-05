import { loadConfig } from './config.ts';
import { buildServer, lanUrls } from './app.ts';
import { startCecBridge } from './cec.ts';

const cfg = loadConfig();
const { app, broadcast } = await buildServer(cfg, { logger: true });

if (cfg.cec) {
  const stop = startCecBridge((key) => broadcast({ type: 'nav', key }, (c) => c.role === 'tv'), (m) => app.log.warn(m));
  app.addHook('onClose', async () => stop());
}

await app.listen({ port: cfg.port, host: cfg.host });
const phonePort = cfg.production ? cfg.port : Number(process.env.NOIR_PHONE_DEV_PORT ?? 5174);
console.log(`\n  NOIR server ready  (deployment: ${cfg.deployment}, demo TV: ${cfg.demoTv ? 'on' : 'off'})`);
console.log(`  Dashboard:  http://localhost:${cfg.production ? cfg.port : 5173}/`);
for (const u of lanUrls(phonePort)) console.log(`  Phone:      ${u}`);
console.log('');

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => void app.close().then(() => process.exit(0)));
