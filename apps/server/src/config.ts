import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DeploymentMode } from '@noir/core';

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  assetsDir: string;
  /** When no real TV is paired, use the simulated TV. */
  demoTv: boolean;
  deployment: DeploymentMode;
  spotifyClientId?: string;
  spotifyRedirectUri: string;
  /** Spawn `cec-client` and translate HDMI-CEC remote presses into NOIR navigation. */
  cec: boolean;
  production: boolean;
  tvDist: string;
  phoneDist: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const port = Number(env.NOIR_PORT ?? env.PORT ?? 8787);
  const deployment = (['browser', 'cast', 'external-hdmi', 'android-tv'] as const).find((d) => d === env.NOIR_DEPLOYMENT) ?? 'browser';
  return {
    port,
    host: env.NOIR_HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.NOIR_DATA_DIR ?? path.join(ROOT_DIR, 'data')),
    assetsDir: path.resolve(env.NOIR_ASSETS_DIR ?? path.join(ROOT_DIR, 'assets')),
    demoTv: env.NOIR_DEMO !== '0',
    deployment,
    spotifyClientId: env.SPOTIFY_CLIENT_ID || undefined,
    spotifyRedirectUri: env.SPOTIFY_REDIRECT_URI ?? `http://127.0.0.1:${port}/api/music/spotify/callback`,
    cec: env.NOIR_CEC === '1',
    production: env.NODE_ENV === 'production',
    tvDist: path.join(ROOT_DIR, 'apps/tv/dist'),
    phoneDist: path.join(ROOT_DIR, 'apps/phone/dist'),
  };
}
