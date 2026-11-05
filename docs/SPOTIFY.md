# Spotify

NOIR uses the official Spotify Web API to show what's playing and to control playback on a
**Spotify Connect device**: your phone, a speaker, or the Spotify app on your TV or streaming stick.
NOIR doesn't play audio itself, and nothing assumes Spotify can play inside a VIZIO app runtime.

## Requirements

- Reading "now playing", recently played and devices works on any account.
- Play/pause/skip/transfer require **Spotify Premium**. On a free account the controls report that clearly.

## Setup

1. Go to https://developer.spotify.com/dashboard → *Create app*.
2. Add the redirect URI `http://127.0.0.1:8787/api/music/spotify/callback`. Spotify only allows HTTPS or loopback IP redirects, so sign-in has to happen on the machine running the NOIR server.
3. Tick *Web API*. Copy the **Client ID**; no client secret is needed because NOIR uses PKCE.
4. Put `SPOTIFY_CLIENT_ID=<id>` in `.env` and restart the server.
5. On the server machine, open `http://127.0.0.1:8787/api/music/spotify/login?redirect=1` and approve. (From the TV dashboard: *Settings → Music → Connect Spotify*.)
6. Choose *Spotify* as the music source (*Settings → Music*, or the phone's Devices tab).

New Spotify apps start in *development mode*, which only allows accounts you add under
*User Management* in the dashboard. Add your own account there.

Tokens are stored encrypted on the server (`data/`) and refreshed automatically. NOIR polls
Spotify only while a NOIR screen or phone is connected: every 5 s while playing, every 15 s otherwise.
