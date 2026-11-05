import { ArrowDown, ArrowUp, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { ACCENTS, AMBIENT_THEMES, BACKGROUNDS, CATEGORY_LABELS, INPUT_ICONS, type AccentId, type AppCategory } from '@noir/core';
import { api, patchSettings, pushToast, useNoir } from '@noir/ui';
import { allApps } from './apps.ts';
import { Btn, Card, Field, Section, Segmented, Toggle, cx } from './ui.tsx';

export function Customize() {
  const state = useNoir((s) => s.state);
  const [custom, setCustom] = useState({ name: '', url: '', category: 'streaming' as AppCategory });
  if (!state) return null;
  const s = state.settings;
  const favs = s.home.favorites;
  const apps = allApps(state);
  const moveFav = (i: number, d: number) => {
    const next = [...favs];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    void patchSettings({ home: { favorites: next } });
  };
  const inputs = state.tv.inputs.length ? state.tv.inputs.map((i) => i.id) : Object.keys(s.inputs);

  return (
    <div>
      <Section title="Home apps · in order">
        <Card className="!p-2">
          {favs.map((id, i) => {
            const app = apps.find((a) => a.id === id);
            return (
              <div key={id} className="flex items-center gap-2 rounded-2xl px-2 py-1.5">
                <span className="w-5 text-center text-[0.8rem] tabular-nums text-fg-dim">{i + 1}</span>
                <span className="flex-1 truncate text-[0.98rem]">{app?.name ?? id}</span>
                <Btn variant="ghost" label="Move up" disabled={i === 0} onClick={() => moveFav(i, -1)} className="!p-2"><ArrowUp className="size-4.5" /></Btn>
                <Btn variant="ghost" label="Move down" disabled={i === favs.length - 1} onClick={() => moveFav(i, 1)} className="!p-2"><ArrowDown className="size-4.5" /></Btn>
                <Btn variant="ghost" label="Remove" onClick={() => void patchSettings({ home: { favorites: favs.filter((f) => f !== id) } })} className="!p-2"><Minus className="size-4.5" /></Btn>
              </div>
            );
          })}
        </Card>
      </Section>

      <Section title="Add to Home">
        <div className="flex flex-wrap gap-2">
          {apps.filter((a) => !favs.includes(a.id)).map((a) => (
            <Btn key={a.id} className="!py-2" disabled={favs.length >= 12} onClick={() => void patchSettings({ home: { favorites: [...favs, a.id] } })}><Plus className="size-4" />{a.name}</Btn>
          ))}
        </div>
        <Card className="mt-3 space-y-3">
          <div className="text-[0.9rem] text-fg">Custom shortcut</div>
          <Field label="Name" value={custom.name} maxLength={40} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="e.g. Crunchyroll" />
          <Field label="Website (optional, used in browser mode)" value={custom.url} onChange={(e) => setCustom({ ...custom, url: e.target.value })} placeholder="https://…" inputMode="url" />
          <Segmented value={custom.category} options={Object.entries(CATEGORY_LABELS) as Array<[AppCategory, string]>} onChange={(category) => setCustom({ ...custom, category })} />
          <Btn variant="primary" disabled={!custom.name.trim()} className="w-full" onClick={async () => {
            try {
              await api('/api/apps/custom', { body: { name: custom.name, category: custom.category, ...(custom.url ? { webUrl: custom.url } : {}) } });
              setCustom({ name: '', url: '', category: 'streaming' });
              pushToast({ tone: 'success', title: 'Shortcut added to the library' });
            } catch (e) { pushToast({ tone: 'error', title: (e as Error).message }); }
          }}>Add shortcut</Btn>
          <p className="text-[0.78rem] text-fg-muted">After pairing your TV, open the app on the TV and use “Learn from TV” on it in NOIR so it can launch.</p>
        </Card>
      </Section>

      <Section title="Accent color">
        <div className="flex gap-3">
          {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
            <button key={id} type="button" aria-label={ACCENTS[id].label} onClick={() => void patchSettings({ appearance: { accent: id } })}
              className={cx('size-11 rounded-full border-2 transition active:scale-90', s.appearance.accent === id ? 'border-white' : 'border-transparent')}
              style={{ background: `linear-gradient(135deg, ${ACCENTS[id].primary}, ${ACCENTS[id].highlight})` }} />
          ))}
        </div>
      </Section>

      <Section title="Background">
        <Segmented value={s.appearance.background} options={Object.entries(BACKGROUNDS) as Array<[keyof typeof BACKGROUNDS, string]>} onChange={(background) => void patchSettings({ appearance: { background } })} />
      </Section>

      <Section title="Animation">
        <Segmented value={s.appearance.motion} options={[['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']]} onChange={(motion) => void patchSettings({ appearance: { motion } })} />
        <Card className="mt-3 !p-1">
          <Toggle label="Glass effects" on={s.appearance.glass} onChange={(glass) => void patchSettings({ appearance: { glass } })} />
          <Toggle label="24-hour clock" on={s.appearance.clock24h} onChange={(clock24h) => void patchSettings({ appearance: { clock24h } })} />
          <Toggle label="Greeting on Home" on={s.home.showGreeting} onChange={(showGreeting) => void patchSettings({ home: { showGreeting } })} />
        </Card>
      </Section>

      <Section title="Inputs">
        <div className="space-y-3">
          {inputs.map((id) => {
            const cfg = s.inputs[id] ?? { label: id, icon: 'tv' as const, hidden: false };
            return (
              <Card key={id} className="space-y-2.5">
                <Field label={id.replace('-', ' ')} defaultValue={cfg.label} maxLength={32}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== cfg.label && void patchSettings({ inputs: { [id]: { ...cfg, label: e.target.value.trim() } } })} />
                <Segmented value={cfg.icon} options={INPUT_ICONS.map((i) => [i, i] as [typeof i, string])} onChange={(icon) => void patchSettings({ inputs: { [id]: { ...cfg, icon } } })} />
                <Toggle label="Hidden" on={cfg.hidden} onChange={(hidden) => void patchSettings({ inputs: { [id]: { ...cfg, hidden } } })} />
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Ambient">
        <Segmented value={s.ambient.theme} options={Object.entries(AMBIENT_THEMES) as Array<[keyof typeof AMBIENT_THEMES, string]>} onChange={(theme) => void patchSettings({ ambient: { theme } })} />
        <div className="mt-3">
          <Segmented value={String(s.ambient.idleMinutes)} options={[['0', 'Never'], ['5', '5 min'], ['10', '10 min'], ['15', '15 min'], ['30', '30 min'], ['60', '1 hr']]} onChange={(v) => void patchSettings({ ambient: { idleMinutes: Number(v) } })} />
        </div>
        <Card className="mt-3 !p-1">
          <Toggle label="Show date" on={s.ambient.showDate} onChange={(showDate) => void patchSettings({ ambient: { showDate } })} />
          <Toggle label="Show now playing" on={s.ambient.showMusic} onChange={(showMusic) => void patchSettings({ ambient: { showMusic } })} />
          <Toggle label="Show weather" hint="Uses Open-Meteo (no account). Set a location below." on={s.ambient.showWeather} onChange={(showWeather) => void patchSettings({ ambient: { showWeather } })} />
        </Card>
        <Card className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Latitude" inputMode="decimal" defaultValue={s.weather.latitude ?? ''} placeholder="32.60"
            onBlur={(e) => { const v = e.target.value.trim(); void patchSettings({ weather: { latitude: v === '' ? null : Number(v) } }); }} />
          <Field label="Longitude" inputMode="decimal" defaultValue={s.weather.longitude ?? ''} placeholder="-85.48"
            onBlur={(e) => { const v = e.target.value.trim(); void patchSettings({ weather: { longitude: v === '' ? null : Number(v) } }); }} />
          <div className="col-span-2"><Segmented value={s.weather.units} options={[['fahrenheit', '°F'], ['celsius', '°C']]} onChange={(units) => void patchSettings({ weather: { units } })} /></div>
        </Card>
      </Section>
    </div>
  );
}
