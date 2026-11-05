import { Loader2, Search, Tv } from 'lucide-react';
import { useState } from 'react';
import { api, patchSettings, pushToast, useNoir } from '@noir/ui';
import { Btn, Card, Field, Section, Segmented, Toggle } from './ui.tsx';

interface Found { host: string; port: number | null; name?: string; model?: string }

/** Wireless TV setup: discover → pair with the on-screen PIN → teach apps. */
export function Devices() {
  const state = useNoir((s) => s.state);
  const pairing = useNoir((s) => s.tvPairing);
  const [ip, setIp] = useState('');
  const [pin, setPin] = useState('');
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [awaitingPin, setAwaitingPin] = useState(false);
  if (!state) return null;
  const tv = state.tv;

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); } finally { setBusy(null); }
  };
  const start = (host: string, port?: number | null) => run('pair', async () => {
    await api('/api/tv/pair/start', { body: { host, ...(port ? { port } : {}) } });
    setAwaitingPin(true);
  });

  const inputs = [null, ...(tv.inputs.length ? tv.inputs.map((i) => i.id) : Object.keys(state.settings.inputs))];

  return (
    <div>
      <Section title="Television">
        <Card>
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-primary/20"><Tv className="size-6 text-highlight" /></div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[1rem]">{tv.adapter === 'vizio' ? tv.device?.model ?? 'VIZIO OS TV' : tv.adapter === 'mock' ? 'Demo TV (simulated)' : 'No TV paired'}</div>
              <div className="truncate text-[0.82rem] text-fg-muted">
                {tv.adapter === 'vizio' ? `${tv.reachable ? 'Online' : 'Unreachable'} · ${tv.device?.address ?? ''}${tv.device?.firmware ? ` · fw ${tv.device.firmware}` : ''}` : 'Pair over Wi‑Fi below'}
              </div>
            </div>
          </div>
          {tv.lastError && tv.adapter === 'vizio' && <p className="mt-3 text-[0.8rem] text-amber-200">{tv.lastError}</p>}
        </Card>
      </Section>

      {(awaitingPin || pairing.stage === 'awaiting-pin') ? (
        <Section title="Enter the PIN shown on your TV">
          <Card className="space-y-3">
            <Field label="4-digit PIN" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="text-center text-[1.6rem] tracking-[0.5em]" />
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => { setAwaitingPin(false); void api('/api/tv/pair/cancel', { body: {} }); }}>Cancel</Btn>
              <Btn variant="primary" className="flex-1" disabled={pin.length !== 4 || !!busy} onClick={() => run('pin', async () => {
                await api('/api/tv/pair/finish', { body: { pin } });
                setAwaitingPin(false); setPin('');
              })}>{busy === 'pin' ? <Loader2 className="size-5 animate-spin" /> : 'Pair'}</Btn>
            </div>
          </Card>
        </Section>
      ) : (
        <Section title="Pair over Wi‑Fi">
          <Card className="space-y-3">
            <p className="text-[0.85rem] leading-relaxed text-fg-muted">Turn the TV on and keep it on the same Wi‑Fi as the NOIR server. Your TV’s IP is under Menu → Network → Network Information.</p>
            <Btn className="w-full" disabled={!!busy} onClick={() => run('find', async () => {
              const r = await api<Found[]>('/api/tv/discover', { body: { scan: true } });
              setFound(r);
              if (!r.length) pushToast({ tone: 'warning', title: 'No TV found', body: 'Enter its IP address instead.' });
            })}>{busy === 'find' ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}Find my TV</Btn>
            {found?.map((f) => (
              <Btn key={f.host} variant="primary" className="w-full" onClick={() => void start(f.host, f.port)}>{f.name ?? f.model ?? 'VIZIO OS TV'} · {f.host}</Btn>
            ))}
            <div className="flex items-end gap-2">
              <div className="flex-1"><Field label="TV IP address" inputMode="decimal" placeholder="192.168.1.42" value={ip} onChange={(e) => setIp(e.target.value.trim())} /></div>
              <Btn variant="primary" disabled={!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip) || !!busy} onClick={() => void start(ip)}>{busy === 'pair' ? <Loader2 className="size-5 animate-spin" /> : 'Pair'}</Btn>
            </div>
          </Card>
        </Section>
      )}

      {tv.adapter === 'vizio' && (
        <Section title="Teach NOIR your apps">
          <Card className="space-y-2">
            <p className="text-[0.85rem] leading-relaxed text-fg-muted">Open an app on the TV with its remote, then tap it here. NOIR records how to launch it on your firmware.</p>
            <div className="flex flex-wrap gap-2">
              {state.settings.home.favorites.map((id) => (
                <Btn key={id} className="!py-2" onClick={async () => {
                  try { const r = await api<{ status: string; message: string }>(`/api/apps/${id}/learn`, { body: {} }); pushToast({ tone: r.status === 'verified' ? 'success' : 'warning', title: r.message }); }
                  catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); }
                }}>{state.launch[id] ? '✓ ' : ''}{id}</Btn>
              ))}
            </div>
            <Btn variant="danger" className="mt-2 w-full" onClick={() => void api('/api/tv/unpair', { body: {} })}>Unpair TV</Btn>
          </Card>
        </Section>
      )}

      <Section title="Boot into NOIR">
        <Card className="space-y-3">
          <p className="text-[0.85rem] text-fg-muted">Which input is NOIR’s device (Android TV stick or mini PC) plugged into?</p>
          <Segmented value={state.settings.system.noirInputId ?? 'none'} options={inputs.map((i) => [i ?? 'none', i ? i.replace('-', ' ') : 'Not set'] as [string, string])}
            onChange={(v) => void patchSettings({ system: { noirInputId: v === 'none' ? null : v } })} />
          <Toggle label="Switch to NOIR when the TV turns on" hint="Watches the TV over Wi‑Fi; needs a paired TV." on={state.settings.system.autoSwitchOnPowerOn}
            onChange={(autoSwitchOnPowerOn) => void patchSettings({ system: { autoSwitchOnPowerOn } })} />
        </Card>
      </Section>

      <Section title="Music">
        <Card className="space-y-3">
          <Segmented value={state.settings.music.provider} options={[['demo', 'Demo'], ['spotify', 'Spotify']]} onChange={(provider) => void patchSettings({ music: { provider } })} />
          <p className="text-[0.85rem] text-fg-muted">
            {!state.spotify.configured ? 'Spotify needs a client ID on the server — see docs/SPOTIFY.md.' : state.spotify.connected ? `Spotify connected${state.spotify.account ? ` as ${state.spotify.account}` : ''}. Control requires Premium.` : 'Sign in from the computer running NOIR: open /api/music/spotify/login?redirect=1 there.'}
          </p>
          {state.spotify.connected && <Btn variant="danger" onClick={() => void api('/api/music/spotify/disconnect', { body: {} })}>Disconnect Spotify</Btn>}
        </Card>
      </Section>

      <Section title="Paired phones">
        <Card className="!p-2">
          {state.phones.map((p) => (
            <div key={p.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="flex-1 truncate">{p.name}</span>
              <Btn variant="ghost" onClick={() => void api(`/api/phones/${p.id}`, { method: 'DELETE' })}>Remove</Btn>
            </div>
          ))}
        </Card>
      </Section>
      <p className="mt-6 text-center text-[0.75rem] text-fg-dim">NOIR {state.version} · {state.mode === 'demo' ? 'demo mode' : 'live'} · {state.deployment}</p>
    </div>
  );
}
