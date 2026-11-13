# Movie Max Railway Broadcaster — audio permission fix

This revision runs Chromium, PulseAudio and FFmpeg as an unprivileged `app` user. It fixes the previous `tv_sink.monitor: Operation not permitted` error by avoiding PulseAudio system mode and using a private per-user PulseAudio socket.

Deploy by pushing these files to the same GitHub repository used by your Railway service, then redeploy.

Railway variable:
`OUTPUT_URL=https://moviemaxtv1.lovable.app/output`

Keep the existing Railway public domain. After deployment, check:
- `/health` — broadcasterRunning should be true and playlistExists should become true.
- `/live/index.m3u8` — the HLS playlist.

No Lovable dashboard changes are required.

Important: Railway Free's $1 monthly credit is not sufficient to promise continuous 24/7 capture. Railway usage and viewer egress may be billable. The output page must also autoplay video/audio without a manual click.
