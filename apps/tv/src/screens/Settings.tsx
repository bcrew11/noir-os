import { AnimatePresence } from 'motion/react';
import {
  Activity, Clock, Cpu, Download, Grid2x2, Image, LifeBuoy, Link2, Monitor, MountainSnow, Music2, Palette, Power, RefreshCw, RotateCcw, Search, Smartphone,
  Sparkles, Trash2, Tv, Wifi,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { ACCENTS, AMBIENT_THEMES, BACKGROUNDS, findApp, type AccentId, type NoirState } from '@noir/core';
import { api, patchSettings, pushToast, useNoir } from '@noir/ui';
import { Dialog } from '../components/Dialog.tsx';
import { Keyboard } from '../components/Keyboard.tsx';
import { FButton, FRow, Pill, Toggle, cx } from '../components/primitives.tsx';
import { useFocusable } from '../focus/focus.ts';
import { useScreenFocus } from '../hooks/useScreenFocus.ts';
import { useUI } from '../store/ui.ts';

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'home', label: 'Home Screen', icon: Grid2x2 },
  { id: 'devices', label: 'Devices', icon: Tv },
  { id: 'music', label: 'Music', icon: Music2 },
  { id: 'ambient', label: 'Ambient', icon: MountainSnow },
  { id: 'system', label: 'System', icon: Cpu },
] as const;

function cycle<T>(list: readonly T[], cur: T): T {
  return list[(list.indexOf(cur) + 1) % list.length]!;
}

function SectionItem({ s, active }: { s: (typeof SECTIONS)[number]; active: boolean }) {
  const { ref, focused, pointer } = useFocusable<HTMLButtonElement>(`sec-${s.id}`, { group: 'sections', onSelect: () => useUI.setState({ settingsSection: s.id }) });
  useEffect(() => { if (focused) useUI.setState({ settingsSection: s.id }); }, [focused, s.id]);
  const Icon = s.icon;
  return (
    <button ref={ref} {...pointer} data-focused={focused || undefined} tabIndex={-1}
      className={cx('flex h-16 w-full items-center gap-4 rounded-2xl px-5 text-left text-[1.3rem] font-medium transition-[background,color,box-shadow] duration-200',
        focused ? 'bg-white/12 text-fg focus-ring' : active ? 'bg-primary/20 text-fg' : 'text-fg-muted')}>
      <Icon className={cx('size-6', active || focused ? 'text-highlight' : '')} strokeWidth={1.7} />{s.label}
    </button>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="mb-8">
    <div className="mb-3 px-1 text-[0.95rem] font-medium uppercase tracking-[0.16em] text-fg-muted">{title}</div>
    <div className="flex flex-col gap-2.5">{children}</div>
  </div>
);

/* --------------------------------- sections -------------------------------- */

function Appearance({ s }: { s: NoirState }) {
  const a = s.settings.appearance;
  const set = (p: Partial<typeof a>) => void patchSettings({ appearance: p });
  const accents = Object.keys(ACCENTS) as AccentId[];
  return (
    <>
      <Group title="Color">
        <FRow id="ap-accent" icon={Palette} title="Accent color" onSelect={() => set({ accent: cycle(accents, a.accent) })}
          value={<span className="flex items-center gap-3">{ACCENTS[a.accent].label}<span className="size-6 rounded-full" style={{ background: `linear-gradient(135deg, ${ACCENTS[a.accent].primary}, ${ACCENTS[a.accent].highlight})` }} /></span>} />
        <FRow id="ap-bg" icon={Image} title="Background" value={BACKGROUNDS[a.background]} onSelect={() => set({ background: cycle(Object.keys(BACKGROUNDS) as Array<keyof typeof BACKGROUNDS>, a.background) })} />
        <FRow id="ap-glass" icon={Sparkles} title="Glass effects" hint="Translucent blurred panels. Turned off automatically on slow hardware." right={<Toggle on={a.glass} />} onSelect={() => set({ glass: !a.glass })} />
      </Group>
      <Group title="Motion">
        <FRow id="ap-motion" icon={Activity} title="Animation" hint="Reduced keeps focus feedback but removes drifting backgrounds and parallax." value={{ full: 'Full', reduced: 'Reduced', off: 'Off' }[a.motion]}
          onSelect={() => set({ motion: cycle(['full', 'reduced', 'off'] as const, a.motion) })} />
        <FRow id="ap-perf" icon={Cpu} title="Performance" value={{ auto: 'Automatic', high: 'High quality', low: 'Low (fastest)' }[a.performance]}
          onSelect={() => set({ performance: cycle(['auto', 'high', 'low'] as const, a.performance) })} />
      </Group>
      <Group title="Display">
        <FRow id="ap-clock" icon={Clock} title="24-hour clock" right={<Toggle on={a.clock24h} />} onSelect={() => set({ clock24h: !a.clock24h })} />
        <FRow id="ap-safe" icon={Monitor} title="Edge margin" hint="Increase if your TV crops the edges of the picture." value={`${a.safeArea}%`} onSelect={() => set({ safeArea: (a.safeArea + 1) % 6 })} />
      </Group>
    </>
  );
}

function HomeSection({ s }: { s: NoirState }) {
  const h = s.settings.home;
  const set = (p: Partial<typeof h>) => void patchSettings({ home: p });
  const inputs = s.tv.inputs.length ? s.tv.inputs.map((i) => i.id) : Object.keys(s.settings.inputs);
  return (
    <>
      <Group title="Apps">
        <FRow id="hm-arrange" icon={Grid2x2} title="Arrange apps" hint="In the App Library or on Home, hold OK on an app to move or remove it." value={`${h.favorites.length} on Home`} onSelect={() => useUI.getState().go('apps')} />
        <FRow id="hm-focus" title="Focused app at launch" value={findApp(h.defaultFocus, s.customApps)?.name ?? '—'} onSelect={() => h.favorites.length && set({ defaultFocus: cycle(h.favorites, h.defaultFocus) })} />
      </Group>
      <Group title="Layout">
        <FRow id="hm-greet" title="Greeting" right={<Toggle on={h.showGreeting} />} onSelect={() => set({ showGreeting: !h.showGreeting })} />
        <FRow id="hm-music" title="Music widget" right={<Toggle on={h.showMusicWidget} />} onSelect={() => set({ showMusicWidget: !h.showMusicWidget })} />
        <FRow id="hm-input" title="Input widget" right={<Toggle on={h.showInputWidget} />} onSelect={() => set({ showInputWidget: !h.showInputWidget })} />
        <FRow id="hm-input-id" title="Input shown on Home" value={`${h.widgetInputId.replace('-', ' ')} · ${s.settings.inputs[h.widgetInputId]?.label ?? ''}`}
          onSelect={() => inputs.length && set({ widgetInputId: cycle(inputs, h.widgetInputId) })} />
      </Group>
    </>
  );
}

type DeviceDialog = null | { kind: 'ip' } | { kind: 'pin' } | { kind: 'found'; tvs: Array<{ host: string; port: number | null; name?: string; model?: string }> } | { kind: 'phone' };

function Devices({ s }: { s: NoirState }) {
  const [dialog, setDialog] = useState<DeviceDialog>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const tv = s.tv;
  const tvPairing = useNoir((x) => x.tvPairing);
  useEffect(() => { if (tvPairing.stage === 'awaiting-pin') setDialog({ kind: 'pin' }); }, [tvPairing.stage]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); } finally { setBusy(null); }
  };
  const startPair = (host: string, port?: number | null) => run('Contacting TV…', async () => {
    await api('/api/tv/pair/start', { body: { host, ...(port ? { port } : {}) } });
    setDialog({ kind: 'pin' });
  });

  const model = tv.device?.model ?? '';
  const title = tv.adapter === 'vizio' ? `${/W4K65M/i.test(model) ? 'onn 65″ 4K · ' : ''}${model || 'VIZIO OS TV'}` : tv.adapter === 'mock' ? 'Demo television (simulated)' : 'No television paired';

  return (
    <>
      <Group title="Television">
        <FRow id="dv-status" icon={Tv} title={title}
          hint={tv.adapter === 'vizio' ? `${tv.reachable ? 'Connected over Wi‑Fi' : `Unreachable${tv.lastError ? ` — ${tv.lastError}` : ''}`} · ${tv.device?.address ?? ''}${tv.device?.firmware ? ` · firmware ${tv.device.firmware}` : ''}` : 'Pair your TV over Wi‑Fi to switch inputs, change volume and open apps.'}
          right={<Pill tone={tv.adapter === 'vizio' && tv.reachable ? 'ok' : tv.adapter === 'mock' ? 'demo' : 'warn'}>{tv.adapter === 'vizio' ? (tv.reachable ? 'Online' : 'Offline') : tv.adapter === 'mock' ? 'Demo' : 'Not paired'}</Pill>}
          onSelect={() => void api('/api/tv/refresh', { body: {} })} />
        <FRow id="dv-find" icon={Search} title="Find my TV on Wi‑Fi" hint="Searches your network for VIZIO OS / SmartCast televisions." value={busy === 'search' ? 'Searching…' : ''}
          onSelect={() => run('search', async () => {
            const tvs = await api<Array<{ host: string; port: number | null; name?: string; model?: string }>>('/api/tv/discover', { body: { scan: true } });
            if (!tvs.length) pushToast({ tone: 'warning', title: 'No TV found', body: 'Make sure the TV is on and on the same Wi‑Fi, or enter its IP address (TV menu → Network).' });
            else setDialog({ kind: 'found', tvs });
          })} />
        <FRow id="dv-ip" icon={Wifi} title="Enter TV IP address" hint="On the TV: Menu → Network → Network Information." onSelect={() => setDialog({ kind: 'ip' })} />
        {tv.adapter === 'vizio' && (
          <>
            <FRow id="dv-import" icon={Download} title="Import app launch data (experimental)" hint="Uses VIZIO’s public app directory. “Learn from TV” on each app is more reliable."
              onSelect={() => run('import', async () => { const r = await api<{ imported: string[] }>('/api/apps/import-catalog', { body: {} }); pushToast({ tone: 'info', title: `Imported ${r.imported.length} app setups`, body: 'Each is marked unverified until it opens successfully.' }); })} />
            <FRow id="dv-unpair" icon={Trash2} title="Unpair this TV" onSelect={() => void api('/api/tv/unpair', { body: {} })} />
          </>
        )}
      </Group>
      <Group title="Phone remote">
        <FRow id="dv-phone" icon={Smartphone} title="Connect your phone" hint="Scan a QR code to open the NOIR remote on your phone." onSelect={() => setDialog({ kind: 'phone' })} />
        {s.phones.map((p) => (
          <FRow key={p.id} id={`dv-ph-${p.id}`} icon={Smartphone} title={p.name} hint={`Paired ${new Date(p.createdAt).toLocaleDateString()}`} value="Remove"
            onSelect={() => void api(`/api/phones/${p.id}`, { method: 'DELETE' })} />
        ))}
      </Group>

      <AnimatePresence>
        {dialog?.kind === 'ip' && <IpDialog key="ip" onClose={() => setDialog(null)} onSubmit={(ip) => { setDialog(null); void startPair(ip); }} busy={busy} />}
        {dialog?.kind === 'pin' && <PinDialog key="pin" onClose={() => { setDialog(null); void api('/api/tv/pair/cancel', { body: {} }); }} onDone={() => setDialog(null)} />}
        {dialog?.kind === 'found' && (
          <Dialog key="found" title="Televisions found" onClose={() => setDialog(null)}>
            <div className="flex flex-col gap-2.5">
              {dialog.tvs.map((t) => (
                <FRow key={t.host} id={`found-${t.host}`} icon={Tv} title={t.name ?? t.model ?? 'VIZIO OS TV'} hint={`${t.host}${t.port ? `:${t.port}` : ' · SmartCast port not detected'}`}
                  onSelect={() => { setDialog(null); void startPair(t.host, t.port); }} />
              ))}
            </div>
          </Dialog>
        )}
        {dialog?.kind === 'phone' && <PhoneLinkDialog key="phone" onClose={() => setDialog(null)} />}
      </AnimatePresence>
    </>
  );
}

function IpDialog({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (ip: string) => void; busy: string | null }) {
  const [ip, setIp] = useState('192.168.');
  const valid = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
  return (
    <Dialog title="TV IP address" subtitle="Find it on the TV under Menu → Network → Network Information." onClose={onClose} width="w-[34rem]">
      <div className="mb-5 flex h-16 items-center rounded-2xl border border-line-strong bg-white/[0.05] px-5 text-[1.8rem] tabular-nums">{ip}<span className="ml-1 h-8 w-0.5 animate-pulse bg-highlight" /></div>
      <Keyboard value={ip} onChange={setIp} mode="numeric" maxLength={15} idPrefix="ip" />
      <FButton id="ip-go" variant="primary" className="mt-5 w-full" label={busy ?? 'Pair'} disabled={!valid} onSelect={() => onSubmit(ip)} />
    </Dialog>
  );
}

function PinDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/tv/pair/finish', { body: { pin } });
      onDone();
    } catch (e) {
      pushToast({ tone: 'error', title: (e as Error).message });
      setPin('');
    } finally { setBusy(false); }
  };
  return (
    <Dialog title="Enter the PIN on your TV" subtitle="Your TV is showing a 4-digit code. This lets NOIR control it over Wi‑Fi." onClose={onClose} width="w-[34rem]">
      <div className="mb-5 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => <span key={i} className="grid h-20 w-16 place-items-center rounded-2xl border border-line-strong bg-white/[0.05] text-[2.6rem] font-semibold">{pin[i] ?? ''}</span>)}
      </div>
      <Keyboard value={pin} onChange={(v) => setPin(v.replace(/\D/g, ''))} mode="numeric" maxLength={4} idPrefix="pin" />
      <FButton id="pin-go" variant="primary" className="mt-5 w-full" label={busy ? 'Pairing…' : 'Pair'} disabled={pin.length !== 4 || busy} onSelect={() => void submit()} />
    </Dialog>
  );
}

function PhoneLinkDialog({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState<{ urls: string[]; qrSvg: string | null } | null>(null);
  useEffect(() => { void api<{ urls: string[]; qrSvg: string | null }>('/api/phone/link').then(setLink).catch(() => setLink({ urls: [], qrSvg: null })); }, []);
  return (
    <Dialog title="Connect your phone" subtitle="Your phone must be on the same Wi‑Fi. You’ll confirm a code shown on this screen." onClose={onClose} width="w-[46rem]">
      <div className="flex items-center gap-8">
        <div className="grid size-56 shrink-0 place-items-center rounded-3xl bg-white/[0.06] p-4 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: link?.qrSvg ?? '' }} />
        <div className="min-w-0 text-[1.15rem] leading-relaxed text-fg-muted">
          <p>Scan with your camera, or open:</p>
          {(link?.urls ?? []).slice(0, 2).map((u) => <p key={u} className="mt-1 break-all text-[1.3rem] font-medium text-fg">{u}</p>)}
          <p className="mt-4">Add it to your Home Screen for an app-like remote.</p>
        </div>
      </div>
      <FButton id="phone-done" className="mt-7" label="Done" autoFocus onSelect={onClose} />
    </Dialog>
  );
}

function MusicSection({ s }: { s: NoirState }) {
  const m = s.settings.music;
  const sp = s.spotify;
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  return (
    <>
      <Group title="Source">
        <FRow id="mu-src" icon={Music2} title="Music source" value={m.provider === 'demo' ? 'Demo (sample data)' : 'Spotify'}
          onSelect={() => void patchSettings({ music: { provider: m.provider === 'demo' ? 'spotify' : 'demo' } })} />
        <FRow id="mu-art" icon={Image} title="Show album artwork" right={<Toggle on={m.showArtwork} />} onSelect={() => void patchSettings({ music: { showArtwork: !m.showArtwork } })} />
      </Group>
      <Group title="Spotify">
        {!sp.configured ? (
          <FRow id="mu-sp-none" icon={Link2} title="Spotify isn’t set up on the server" hint="Create a Spotify developer app and set SPOTIFY_CLIENT_ID. See docs/SPOTIFY.md." />
        ) : sp.connected ? (
          <>
            <FRow id="mu-sp-acct" icon={Link2} title={`Connected${sp.account ? ` as ${sp.account}` : ''}`} hint="Playback control requires Spotify Premium. NOIR controls a Spotify Connect device; it doesn’t play audio itself." />
            <FRow id="mu-sp-dc" icon={Trash2} title="Disconnect Spotify" onSelect={() => void api('/api/music/spotify/disconnect', { body: {} })} />
          </>
        ) : (
          <FRow id="mu-sp-connect" icon={Link2} title="Connect Spotify" hint={local ? 'Opens Spotify sign-in in a new tab.' : 'Sign in on the computer running NOIR (Spotify only returns to 127.0.0.1), or use the phone app from that computer.'}
            onSelect={() => { if (local) window.open('/api/music/spotify/login?redirect=1', '_blank'); else pushToast({ tone: 'info', title: 'Open NOIR on the server computer to sign in', body: sp.redirectUri }); }} />
        )}
      </Group>
    </>
  );
}

function AmbientSection({ s }: { s: NoirState }) {
  const a = s.settings.ambient;
  const set = (p: Partial<typeof a>) => void patchSettings({ ambient: p });
  const idle = [0, 5, 10, 15, 30, 60];
  return (
    <>
      <Group title="Display">
        <FRow id="am-theme" icon={MountainSnow} title="Theme" value={AMBIENT_THEMES[a.theme]} onSelect={() => set({ theme: cycle(Object.keys(AMBIENT_THEMES) as Array<keyof typeof AMBIENT_THEMES>, a.theme) })} />
        <FRow id="am-clock" icon={Clock} title="Clock style" value={{ light: 'Light', bold: 'Bold', serif: 'Serif' }[a.clockStyle]} onSelect={() => set({ clockStyle: cycle(['light', 'bold', 'serif'] as const, a.clockStyle) })} />
        <FRow id="am-date" title="Show date" right={<Toggle on={a.showDate} />} onSelect={() => set({ showDate: !a.showDate })} />
        <FRow id="am-music" title="Show now playing" right={<Toggle on={a.showMusic} />} onSelect={() => set({ showMusic: !a.showMusic })} />
        <FRow id="am-weather" title="Show weather" hint={s.settings.weather.latitude == null ? 'Set your location from the phone app first.' : 'Open-Meteo, refreshed every 30 minutes.'}
          right={<Toggle on={a.showWeather} />} onSelect={() => set({ showWeather: !a.showWeather })} />
        {a.theme === 'photo' && <FRow id="am-photo" title="Photo duration" value={`${a.photoIntervalSec}s`} onSelect={() => set({ photoIntervalSec: cycle([20, 60, 300, 900], a.photoIntervalSec) })} />}
      </Group>
      <Group title="Start">
        <FRow id="am-idle" icon={Power} title="Start after inactivity" hint="Counts inactivity inside NOIR only; it doesn’t replace the TV’s own screensaver." value={a.idleMinutes ? `${a.idleMinutes} min` : 'Never'}
          onSelect={() => set({ idleMinutes: cycle(idle, a.idleMinutes) })} />
        <FRow id="am-now" icon={Sparkles} title="Start ambient now" onSelect={() => useUI.getState().go('ambient')} />
      </Group>
    </>
  );
}

function SystemSection({ s }: { s: NoirState }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const sys = s.settings.system;
  const inputs = [null, ...(s.tv.inputs.length ? s.tv.inputs.map((i) => i.id) : Object.keys(s.settings.inputs))];
  const deploymentLabel = { browser: 'Browser (development)', cast: 'Cast / AirPlay from a computer', 'external-hdmi': 'External HDMI device', 'android-tv': 'Android TV launcher' }[s.deployment];
  return (
    <>
      <Group title="Boot into NOIR">
        <FRow id="sy-input" icon={Monitor} title="NOIR is connected to" hint="The TV input NOIR runs on (External HDMI or Android TV mode)." value={sys.noirInputId?.replace('-', ' ') ?? 'Not set'}
          onSelect={() => void patchSettings({ system: { noirInputId: cycle(inputs, sys.noirInputId) } })} />
        <FRow id="sy-auto" icon={Power} title="Switch to NOIR when the TV turns on" hint="NOIR watches the TV over Wi‑Fi and selects its input at power-on. Requires a paired TV."
          right={<Toggle on={sys.autoSwitchOnPowerOn} />} disabled={!sys.noirInputId} onSelect={() => void patchSettings({ system: { autoSwitchOnPowerOn: !sys.autoSwitchOnPowerOn } })} />
      </Group>
      <Group title="About">
        <FRow id="sy-ver" icon={Cpu} title="NOIR version" value={s.version} />
        <FRow id="sy-mode" title="Deployment" value={deploymentLabel} />
        <FRow id="sy-diag" icon={Activity} title="Connection diagnostics" onSelect={() => void api<Record<string, unknown>>('/api/diagnostics').then(setDiag)} />
        <FRow id="sy-refresh" icon={RefreshCw} title="Refresh TV state, logos and photos" onSelect={() => void api('/api/tv/refresh', { body: {} }).then(() => pushToast({ tone: 'success', title: 'Refreshed' }))} />
      </Group>
      <Group title="Recovery">
        <FRow id="sy-recover" icon={LifeBuoy} title="Getting back to the TV’s own interface" hint="NOIR never modifies your TV. Press the Home button on the TV remote, or switch inputs, to return to VIZIO OS at any time." />
        <FRow id="sy-reset" icon={RotateCcw} title="Reset preferences" hint="Restores default settings. Pairings are kept." onSelect={() => setConfirmReset(true)} />
      </Group>
      <AnimatePresence>
        {confirmReset && (
          <Dialog key="reset" title="Reset all preferences?" subtitle="Appearance, Home layout, input names and ambient settings return to defaults." onClose={() => setConfirmReset(false)} width="w-[38rem]">
            <div className="flex gap-4">
              <FButton id="reset-no" label="Cancel" autoFocus onSelect={() => setConfirmReset(false)} />
              <FButton id="reset-yes" variant="primary" label="Reset" onSelect={() => void api('/api/settings/reset', { body: {} }).then(() => setConfirmReset(false))} />
            </div>
          </Dialog>
        )}
        {diag && (
          <Dialog key="diag" title="Diagnostics" onClose={() => setDiag(null)} width="w-[52rem]">
            <pre className="whitespace-pre-wrap rounded-2xl bg-black/30 p-5 font-mono text-[0.95rem] leading-relaxed text-fg/85">{JSON.stringify(diag, null, 2)}</pre>
            <FButton id="diag-close" className="mt-5" label="Close" autoFocus onSelect={() => setDiag(null)} />
          </Dialog>
        )}
      </AnimatePresence>
    </>
  );
}

export default function Settings() {
  const state = useNoir((s) => s.state);
  const section = useUI((s) => s.settingsSection);
  useScreenFocus('settings', `sec-${section}`);
  if (!state) return null;
  return (
    <div className="flex h-full gap-12 pb-32 pt-10">
      <aside className="w-[22rem] shrink-0">
        <h1 className="mb-7 px-2 text-[3rem] font-semibold tracking-[-0.02em]">Settings</h1>
        <div className="flex flex-col gap-1.5">{SECTIONS.map((x) => <SectionItem key={x.id} s={x} active={section === x.id} />)}</div>
      </aside>
      <section className="scroll-hidden glass min-w-0 flex-1 overflow-y-auto rounded-[2rem] p-8" style={{ background: 'linear-gradient(180deg, rgba(36,28,52,0.55), rgba(20,16,30,0.6))' }}>
        {section === 'appearance' && <Appearance s={state} />}
        {section === 'home' && <HomeSection s={state} />}
        {section === 'devices' && <Devices s={state} />}
        {section === 'music' && <MusicSection s={state} />}
        {section === 'ambient' && <AmbientSection s={state} />}
        {section === 'system' && <SystemSection s={state} />}
      </section>
    </div>
  );
}
