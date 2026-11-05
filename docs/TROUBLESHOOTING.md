# Troubleshooting

**Dashboard shows "Connecting to the NOIR server…"**
The server isn't running or isn't reachable. Run `npm run dev` (development) or `npm start`. Check `http://<server>:8787/api/health`.

**Phone says "No NOIR screen is open right now"**
The pairing code is shown only on a connected NOIR screen. Open the dashboard first, then try again.

**Phone shows "not paired" after working before**
The phone was removed (*Settings → Devices*), or the server's `data/` folder was deleted. Pair again.

**"No TV found" when searching**
- Make sure the TV is on and on the same network as the NOIR server. Guest Wi-Fi and "AP isolation" block local discovery.
- Enter the IP manually (TV: *Menu → Network → Network Information*).
- Run the read-only probe: `npm run probe -w @noir/server -- <tv-ip>`.

**Probe says no SmartCast port answered**
Your TV's firmware may not expose the local API, or a setting has turned it off. Look for settings related to mobile device control or SmartCast in the TV menu. NOIR's remote, music, ambient and phone features still work. TV control (inputs, volume, app launching) doesn't.

**Pairing fails or times out**
Make sure no other pairing PIN is on screen. Power-cycle the TV and try again. Each new pairing replaces the previous NOIR token.

**Commands show "Sent to the TV — not yet confirmed"**
The TV accepted the request, but reading the state back didn't show the change yet. This is normal for remote-key presses, which can't be confirmed. If an input switch keeps showing this, include your model and firmware when you report it.

**An app says "Needs setup"**
Open the app on the TV with its own remote, then in NOIR hold OK on the app → *Learn from TV*.

**TV doesn't turn on from NOIR or the phone**
Many TVs turn off networking in standby. Turn on the TV's quick-start or fast-power-on mode if it has one. Otherwise, power on with the TV remote.

**Animations stutter on the TV device**
Set *Settings → Appearance → Performance* to *Low*, or *Animation* to *Reduced*. *Automatic* switches to low mode when it measures slow frames.

**Official app logos**
NOIR draws typographic tiles by default. To use official artwork you are licensed to use (for example from a company's press kit), save it as `assets/icons/<app-id>.svg` or `.png` (e.g. `assets/icons/netflix.svg`), then choose *Settings → System → Refresh*.

**Ambient photos**
Put `.jpg`, `.png`, `.webp` or `.avif` files in `assets/backgrounds/photos/` and refresh.
