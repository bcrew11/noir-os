# Deploying NOIR

Every mode uses the same frontend and the same NOIR server. Only *where the dashboard is
displayed* changes. The server is a small Node.js process that keeps settings, talks to the TV over
Wi-Fi and serves the dashboard (`/`) and phone remote (`/phone/`).

| Mode | Hardware | Boots into NOIR? | Opens streaming apps by | TV remote controls NOIR? |
|---|---|---|---|---|
| **A. Browser** (development) | Your computer | — | VIZIO API (after pairing) | No (keyboard or phone) |
| **B. Cast / AirPlay** (fully wireless) | A computer that stays on | No | VIZIO API | No (phone remote) |
| **C. Android TV launcher** ⭐ recommended | Google TV / Android TV stick + an always-on NOIR server | **Yes** | Android, natively | **Yes** (stick's remote) |
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

You need any Google TV or Android TV device on HDMI (an inexpensive Google TV stick or box works),
plus the NOIR server running somewhere always on: a home computer, a Raspberry Pi, or a NAS.

1. **Server:** on the always-on machine, set `NOIR_DEPLOYMENT=android-tv` and start NOIR. Note its address, e.g. `http://192.168.1.20:8787/`. Giving it a DHCP reservation in your router helps.
2. **Build the APK** (on a computer with Android Studio or the Android SDK and JDK 17):
   ```bash
   cd android && ./gradlew assembleDebug
   ```
   The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`.
3. **Install wirelessly.** On the stick: *Settings → System → About* → click *Android TV OS build* 7 times to enable Developer options. Then turn on *USB debugging* (and *Wireless debugging* where offered).
   ```bash
   adb connect <stick-ip>:5555
   ```
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```
   Accept the prompt on the TV. On Android 11+ wireless debugging, use `adb pair <ip>:<port>` with the code shown on screen first.
4. **First run:** open NOIR from the apps row and enter the server address. Hold **Back** for 2 seconds to change it later.
5. **Make NOIR the home screen:**
   ```bash
   adb shell cmd package set-home-activity app.noir.launcher/.MainActivity
   ```
   Some Google TV builds ignore third-party home activities. A widely used fallback, which can be reversed at any time, is to disable the stock launcher:
   ```bash
   adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
   ```
   To undo it:
   ```bash
   adb shell pm enable com.google.android.apps.tv.launcherx
   ```
   A system update can reset this choice. NOIR also starts itself on boot (`BOOT_COMPLETED`).
6. **On the TV:** turn on *CEC* in its settings. Powering on the TV then wakes the stick, the TV switches to it, and NOIR is the first screen. In NOIR, set *Settings → System → NOIR is connected to* to the stick's HDMI port. If the TV doesn't switch on its own, also enable *Switch to NOIR when the TV turns on* (this needs the TV paired over Wi-Fi).

In this mode NOIR opens YouTube TV, Netflix and the rest **on the stick** through Android, and
checks first that each app is installed. Phone shortcuts are forwarded to the launcher.

**Status:** the APK **builds cleanly** (Android SDK 35, AGP 8.7, JDK 21) and the manifest shows it as
a Leanback launcher and HOME-capable app. It has **not yet been run on a real Android TV device**.
A prebuilt debug APK can be installed directly with `adb install`.

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
