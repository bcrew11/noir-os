# VIZIO OS / onn compatibility

Target television: **onn 65″ 4K (W4K65M-1031)** running **VIZIO OS firmware 86.920.9.3-2** (from the
TV's *TV Information* screen). Software version 86.920.9.3-2.12.

> **Probe results (Nov 2026, onn W4K65M-1031, firmware 86.920.9.3-2):**
> - SmartCast local API **present** on HTTPS port **7345** (9000 closed), API version `3.7.3-2640.0001`.
> - `/state/device/deviceinfo` and `/state/device/power_mode` answer **without pairing**.
>   Device info includes `MODEL_NAME`, `CAST_NAME` (the TV's name) and an `INPUTS` list containing
>   `hdmi1–3`, `cast` and `airplay`.
> - Input and app endpoints return `REQUIRES_PAIRING` (HTTP 403) until paired, as expected.
> - SSDP discovery did **not** find the TV (only the router and a Roku answered); the port scan did.
>
> Still unverified: pairing, input switching, volume and app launch on this model. Run
> `npm run tv:report` after pairing and record the results below.

## What NOIR can and cannot do on VIZIO OS

| Capability | Status | Source / notes |
|---|---|---|
| Replace the VIZIO OS home screen | **Not possible** | VIZIO OS has no third-party launcher support. NOIR never modifies firmware. |
| Install NOIR as an app on the TV | **Not available to individuals** | VIZIO apps are HTML5 apps registered with VIZIO. Developer mode (“Conjure” launcher, sideloading over port 7345) has to be enabled by VIZIO for a specific TV serial through its partner program. |
| Make the TV boot into a third-party app | **Not possible** | No API sets a default app at power-on. NOIR's alternative is *Switch to NOIR when the TV turns on* (below). |
| Local control API (“SmartCast API”) | **Confirmed on this TV** (port 7345, API 3.7.3) | HTTPS on **port 7345** (9000 on older firmware) with a self-signed certificate. Used by Home Assistant, openHAB and pyvizio. It hasn't been confirmed on onn VIZIO OS models. |
| Pairing | Documented by the community | `PUT /pairing/start` → TV shows a 4-digit PIN → `PUT /pairing/pair` → auth token. Pairing again with the same device id invalidates the old token. |
| Read power / input / volume / device info | Documented by the community | NOIR reads these and marks a capability **verified** once your TV answers. |
| Switch HDMI input | Documented by the community | `PUT …/devices/current_input` with the current `HASHVAL`. NOIR reads the input back and only reports success when the TV confirms the change. |
| Volume / mute | Documented by the community | Volume is set through the audio settings; mute uses key codes. Both are read back. |
| Remote keys (D-pad, OK, Back, Home…) | Documented by the community | `PUT /key_command/` with community key codes (`packages/tv-adapters/src/vizio/keys.ts`). The TV can't confirm a key press, so these are reported as **sent**. |
| Power on over Wi-Fi | Depends on settings | Only works if the TV keeps its network up in standby (look for *Quick Start* / *Power Mode* or a similar eco setting). Power off works whenever the TV is reachable. |
| Launch streaming apps | Works per app, after learning | App IDs and namespaces differ by firmware, so NOIR **learns** them from your TV (below) instead of hardcoding them. The public VIZIO app directory can be imported as unverified candidates. |
| Cast / AirPlay a NOIR tab to the TV | **Likely**: the TV lists `cast` and `airplay` inputs | VIZIO SmartCast sets ship with Chromecast built-in and AirPlay 2. Check whether your onn model lists them (TV menu, or try casting a Chrome tab). |
| HDMI-CEC (TV remote → device on HDMI) | Usually available | Look for a *CEC* setting under System. Which remote keys get forwarded depends on the TV firmware. |

## Recommended setup order (lowest risk first)

1. **Probe (read-only).** On a computer on the same Wi-Fi:
   ```bash
   npm run probe -w @noir/server -- <tv-ip>
   ```
   The TV's IP address is under *Menu → Network → Network Information*. The probe changes nothing on the TV. It reports whether port 7345 or 9000 answers and what read-only endpoints return.
2. **Pair.** NOIR → *Settings → Devices → Find my TV on Wi-Fi* (or *Enter TV IP address*), or use the phone app's Devices tab. Enter the PIN the TV shows. The token is stored encrypted on the NOIR server, never in the browser.
3. **Read-only state.** *Settings → Devices* should show model `W4K65M-1031` and your firmware.
4. **Low-risk commands.** Try volume, then mute, then input switching from the Inputs screen. Read-back promotes each one to *verified*.
5. **Teach apps.** Open YouTube TV on the TV with its own remote, then in NOIR hold OK on the YouTube TV card → *Learn from TV*. Repeat for YouTube, ESPN, Netflix and Disney+. After the first successful launch, NOIR marks that app *Ready · verified*.

## Undoing everything

NOIR doesn't change TV settings or firmware. To remove it completely:

- In NOIR: *Settings → Devices → Unpair this TV*. The TV may also list NOIR under its paired mobile devices; remove it there.
- Press **Home** on the TV remote at any time to get back to VIZIO OS.

## Model / firmware notes

| Model | Firmware | Probe | Pairing | Inputs | Volume | Apps | Notes |
|---|---|---|---|---|---|---|---|
| onn W4K65M-1031 | 86.920.9.3-2 (API 3.7.3) | ✅ port 7345 | _untested_ | _untested_ | _untested_ | _untested_ | Fill in after running the probe |
