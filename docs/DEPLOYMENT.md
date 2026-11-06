# Deploying NOIR

Every mode uses the same frontend and the same NOIR server. Only *where the dashboard is
displayed* changes. The server is a small Node.js process that keeps settings, talks to the TV over
Wi-Fi and serves the dashboard (`/`) and phone remote (`/phone/`).

| Mode | Hardware | Boots into NOIR? | Opens streaming apps by | TV remote controls NOIR? |
|---|---|---|---|---|
| **A. Browser** (development) | Your computer | — | VIZIO API (after pairing) | No (keyboard or phone) |
| **B. Cast / AirPlay** (fully wireless) | A computer that stays on | No | VIZIO API | No (phone remote) |
| **C. Android TV launcher** ⭐ recommended | A Google TV / Android TV device (nothing else) | **Yes** | Android, natively | **Yes** (device's remote) |
| **D. External HDMI computer** | Raspberry Pi 5 / mini PC | **Yes** | VIZIO API | Yes, via HDMI-CEC |

> A native VIZIO OS app isn't one of the options. See [VIZIO_COMPATIBILITY.md](VIZIO_COMPATIBILITY.md).

## Production build (all modes)

```bash
npm install
```

```bash
npm run build
```

```bash
NODE_ENV=production npm start
```

Copy `.env.example` to `.env` and adjust it, or export the variables. The server prints the
dashboard and phone URLs when it starts. Everything is served from one port (default 8787).

## A. Browser mode

```bash
npm run dev
```

Open http://localhost:5173. Arrow keys move focus, Enter is OK (hold for options), Esc/Backspace is
Back, H is Home, Space is Play/Pause. Press the backtick key to toggle the on-screen remote
simulator. Phone: open the printed `http://<your-ip>:5174/phone/` URL.

## B. Cast / AirPlay (no extra hardware)

1. Run NOIR in production mode on a computer that stays on. Set `NOIR_DEPLOYMENT=cast`.
2. Open `http://localhost:8787` in Chrome and press F11 for full screen.
3. Chrome menu → *Cast…* → choose the TV → *Cast tab*. On a Mac with AirPlay, you can mirror the display instead.
4. Use the phone remote to drive NOIR.

Limitations: casting has some latency, and the TV's own remote doesn't control the cast tab. Opening
a streaming app through NOIR ends the cast, so you have to cast again to get back to NOIR. Good for
trying NOIR on the big screen; not ideal as a daily setup.

## C. Android TV launcher (recommended: installed app, boots automatically)

**Follow [GOOGLE_TV_SETUP.md](GOOGLE_TV_SETUP.md).** In short:

- The NOIR dashboard is **bundled inside the APK** and runs self-contained on the Google TV / Android TV device. You don't need a NOIR server or an always-on computer.
- Apps come from Google Play and open natively. NOIR checks that each app is installed and offers its Google Play page if it isn't.
- Tiles use each installed app's own TV banner from the device, the same artwork the system launcher shows.
- The music widget controls whatever is playing on the device. With notification access, it also shows the track.
- There's no TV-input control in this mode, so the Inputs screen is hidden. HDMI-CEC handles power and input.

Build the APK:

```bash
scripts/build-android.sh
```

It needs the Android SDK and JDK 17+, and writes `android/app/build/outputs/apk/debug/app-debug.apk`.

**Status:** builds cleanly. Tested in a desktop browser against a simulated Android bridge:
launching, the Google Play fallback, media keys, now-playing and app discovery all behaved
correctly. **Not yet run on a physical Google TV device.**

## D. External HDMI computer (Raspberry Pi 5 / mini PC)

1. Install Node.js 22.13+ and Chromium. For CEC: `sudo apt install cec-utils`.
2. Clone NOIR, then build it:
   ```bash
   npm ci
   ```
   ```bash
   npm run build
   ```
3. Install the services from `scripts/systemd/`. Edit the paths and user name first.
   ```bash
   sudo cp scripts/systemd/noir-server.service /etc/systemd/system/
   ```
   ```bash
   mkdir -p ~/.config/systemd/user && cp scripts/systemd/noir-kiosk.service ~/.config/systemd/user/
   ```
   ```bash
   sudo systemctl enable --now noir-server
   ```
   ```bash
   systemctl --user enable --now noir-kiosk
   ```
4. Set `NOIR_DEPLOYMENT=external-hdmi` and `NOIR_CEC=1` in `/etc/noir.env`. The server then reads TV-remote key presses forwarded over HDMI-CEC and maps them to NOIR navigation.
5. Turn on CEC on the TV and set NOIR's input under *Settings → System*.

Streaming apps still open on the TV itself through the VIZIO API. Press Home on the TV remote and
switch back to the Pi's input (or use *Return to NOIR*) to come back.

## Recovery

- NOIR never modifies the TV. Press **Home** on the TV remote, or change input, to get back to VIZIO OS.
- To reset NOIR's preferences, use *Settings → System → Reset preferences*. To start completely fresh, stop the server and delete `data/`. That forgets pairings and Spotify sign-in.
- To give the Android stick back to Google TV: `adb shell pm enable com.google.android.apps.tv.launcherx`, or uninstall NOIR with `adb uninstall app.noir.launcher`.
