# NOIR OS

A cinematic, remote-first TV home screen in dark purple, built for an **onn 65″ 4K (VIZIO OS)**
television, with a phone companion app. It keeps your apps (YouTube TV, YouTube, ESPN, Netflix, Disney+),
music, inputs and an ambient display one press away.

NOIR is honest about hardware. Anything simulated carries a **Demo** badge, a command sent to the
TV is reported as *sent* until the TV confirms it, and features the TV doesn't support are explained
instead of faked.

## Quick start

Requires Node.js **22.13+**.

```bash
npm install
```

```bash
npm run dev
```

- **TV dashboard:** http://localhost:5173 (arrow keys, Enter = OK, hold Enter = options, Esc = Back, H = Home, Space = Play/Pause, backtick = on-screen remote)
- **Phone remote:** the `Phone:` URL printed by the server (e.g. `http://192.168.1.20:5174/phone/`). Your phone must be on the same Wi-Fi. Pair it with the 6-digit code shown on the TV screen.
- Out of the box, NOIR runs in **demo mode**: a simulated TV and sample music, clearly labelled.

## Connect your TV (wireless)

1. Make sure the TV is on and on the same Wi-Fi as the computer running NOIR.
2. Optional, read-only check:
   ```bash
   npm run probe -w @noir/server -- <tv-ip>
   ```
3. In NOIR: **Settings → Devices → Find my TV on Wi-Fi**, or use the phone's **Devices** tab. Enter the PIN the TV shows.
4. Open each favorite app once with the TV remote, then in NOIR hold OK on it → **Learn from TV**.

See [docs/VIZIO_COMPATIBILITY.md](docs/VIZIO_COMPATIBILITY.md) for what VIZIO OS allows and what is still unverified on your model.

## Making NOIR the first thing you see

VIZIO OS can't run third-party launchers or install personal apps. The practical options, in order:

1. **Google TV launcher (recommended).** NOIR runs self-contained as the home screen of a Google TV / Android TV device. Apps come from Google Play and open natively, and no computer or server is needed. → [docs/GOOGLE_TV_SETUP.md](docs/GOOGLE_TV_SETUP.md)
2. **External HDMI computer.** A Raspberry Pi in kiosk mode, with the TV remote working over HDMI-CEC.
3. **Cast / AirPlay** a NOIR tab from a computer. No extra hardware, but not automatic.

Whichever you choose, *Settings → System → Switch to NOIR when the TV turns on* can select NOIR's input over Wi-Fi at power-on.

## Production

```bash
npm run build
```

```bash
NODE_ENV=production npm start
```

The dashboard is served at `http://<host>:8787/` and the phone app at `/phone/`. Configuration lives in `.env` (see `.env.example`).

## Project layout

```
apps/
  tv/        React dashboard (Vite, Tailwind v4, Motion) — spatial focus engine in src/focus/
  phone/     Phone companion PWA (remote, customization, wireless TV setup)
  server/    Fastify + WebSocket + SQLite (node:sqlite); pairing, state, TV/music managers
packages/
  core/          Shared types: TVAdapter + capabilities, app catalog, settings schema (Zod), protocol
  tv-adapters/   MockTVAdapter (browser-safe) and VizioAdapter, pairing, LAN discovery (Node)
  integrations/  Music providers (demo, Spotify PKCE), weather
  ui/            Design tokens, brand tiles, realtime client shared by tv + phone
android/     Android TV launcher shell (WebView + native app-launch bridge)
assets/      icons/ (optional official logos), backgrounds/photos/ (ambient), branding/
docs/        Compatibility, deployment, Spotify, troubleshooting
scripts/     screenshots.mjs, systemd units
tests/e2e/   Playwright end-to-end tests
```

### Architecture rules

- The dashboard never calls the TV. It talks to the NOIR server, which owns one `TVAdapter`.
- Every adapter publishes `TVCapabilities` (`verified` / `documented` / `experimental` / `unsupported`). The UI disables or explains anything unsupported.
- Command results are `verified` (state read back), `sent`, `demo`, `unsupported` or `failed`. Nothing reports success without a read-back.
- TV and Spotify credentials stay on the server, encrypted at rest. Phones get their own revocable tokens through on-screen code pairing. Only the local dashboard (loopback) is trusted without a token.
- App launch IDs are never hardcoded. They are learned from your TV or imported as unverified candidates.

## Quality checks

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run test:e2e
```

`npm run test:e2e` needs `npm run dev` running. `npm run screenshots` captures every screen to `screenshots/`.

## Branding note

App tiles are typographic treatments in each service's colors, not copies of their logos. To use
official logos you're licensed to use, drop them in `assets/icons/<app-id>.svg|png`. Demo music
uses fictional tracks with generated artwork.
