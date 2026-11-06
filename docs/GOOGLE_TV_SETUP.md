# Set up NOIR as your TV's home screen (Google TV)

NOIR runs **entirely on a Google TV / Android TV device** plugged into your TV. You don't need a
computer, server or Roku, and NOIR doesn't control your TV over the network. Your apps come from
Google Play and open directly from NOIR.

**What you need:** any Google TV or Android TV streaming device, and your Mac for a ten-minute
one-time install. Avoid Amazon Fire TV: it isn't Google TV and blocks custom home screens.

## 1. Set up the device normally

1. Plug it into a free HDMI port on the TV (HDMI-2 is free on your onn), or replace the Roku on HDMI-3.
2. Go through Google's setup and sign in.
3. Install your apps from **Google Play** on the device: YouTube TV, YouTube, ESPN, Netflix, Disney+, and anything else you want.
4. Note the device's IP address: *Settings → Network & Internet → (your Wi-Fi)*.

## 2. Turn on developer mode on the device

1. *Settings → System → About* → select **Android TV OS build** 7 times until it says you're a developer.
2. *Settings → System → Developer options* → turn on **USB debugging**.

## 3. Install NOIR from your Mac

On the Mac, in Terminal. Homebrew is required; get it from https://brew.sh if you don't have it.

```bash
brew install --cask android-platform-tools
```

```bash
adb connect <device-ip>:5555
```

The TV shows *"Allow USB debugging?"*. Tick **Always allow from this computer** and choose **OK**.
If `adb connect` is refused, go to *Developer options → Wireless debugging → Pair device with
pairing code* and run `adb pair <ip>:<port>` with the code shown, then `adb connect` again.

```bash
adb install -r ~/Downloads/noir-launcher.apk
```

## 4. Make NOIR the home screen

```bash
adb shell cmd package set-home-activity app.noir.launcher/.MainActivity
```

Press the remote's **Home** button. If the Google TV home still appears, your device ignores that
setting. The common, reversible fix is to switch off Google's launcher:

```bash
adb shell pm disable-user --user 0 com.google.android.apps.tv.launcherx
```

Undo at any time with:

```bash
adb shell pm enable com.google.android.apps.tv.launcherx
```

A Google TV system update can turn this back on; run the command again if that happens.

## 5. Optional: show what's playing

This lets NOIR's music widget show the song playing in Spotify or YouTube Music on the device:

```bash
adb shell cmd notification allow_listener app.noir.launcher/app.noir.launcher.MediaListener
```

Play/pause and skip work without this step.

## 6. Make the TV start on NOIR

On the TV, open its settings and:

- Turn on **CEC** (usually under *System*). Turning the TV on then wakes the device, and the device tells the TV to switch to it. Its remote can usually also control the TV's volume and power.
- Look for a setting that controls what the TV shows at power-on (VIZIO OS calls it *Boot to SmartCast* / start on last input). Turn off booting to the VIZIO home, so the TV comes back to the device's input.

Your TV reports that it supports this boot option, but the exact menu name on your firmware hasn't
been confirmed.

## Using NOIR

- **D-pad** moves, **OK** opens, **hold OK** on an app for options (move, remove, Google Play), **Back** goes back, **Home** returns to NOIR's home.
- New apps installed from Google Play appear in the **App Library** automatically.
- Apps that aren't installed show **Get**; selecting one opens its Google Play page.
- **Hold Back for 2 seconds** for an advanced option: pointing NOIR at a NOIR server. Leave it empty.

## Undo everything

```bash
adb shell pm enable com.google.android.apps.tv.launcherx
```

```bash
adb uninstall app.noir.launcher
```

The device goes back to the normal Google TV home. Nothing on the TV itself was changed.
