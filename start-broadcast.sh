#!/bin/bash
set -euo pipefail

: "${OUTPUT_URL:?Set OUTPUT_URL to your public Movie Max /output URL}"

WIDTH="${SCREEN_WIDTH:-1280}"
HEIGHT="${SCREEN_HEIGHT:-720}"
FPS="${FPS:-25}"
mkdir -p /app/hls /tmp/pulse /tmp/runtime-app
chmod 700 /tmp/pulse /tmp/runtime-app
rm -f /app/hls/index.m3u8 /app/hls/seg_*.ts /tmp/pulse/native

echo "Starting virtual display as unprivileged app user..."
Xvfb :99 -screen 0 "${WIDTH}x${HEIGHT}x24" -ac +extension GLX +render -noreset &
XVFB_PID=$!
sleep 2

echo "Starting PulseAudio in per-user mode (not system mode)..."
pulseaudio --daemonize=yes --exit-idle-time=-1 --log-target=stderr \
  --load="module-native-protocol-unix socket=/tmp/pulse/native auth-anonymous=1" \
  --load="module-null-sink sink_name=tv_sink" \
  --load="module-always-sink" || {
    echo "ERROR: PulseAudio failed to start"
    exit 1
  }

export PULSE_SERVER=unix:/tmp/pulse/native
for i in $(seq 1 20); do
  if pactl info >/dev/null 2>&1; then break; fi
  sleep 1
done
pactl info
pactl set-default-sink tv_sink
pactl list short sinks

cleanup() {
  kill "${CHROME_PID:-}" "${XVFB_PID:-}" 2>/dev/null || true
  pulseaudio --kill 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Opening Movie Max output page..."
chromium \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --disable-background-timer-throttling \
  --disable-renderer-backgrounding \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run \
  --no-default-browser-check \
  --disable-session-crashed-bubble \
  --window-position=0,0 \
  --window-size="${WIDTH},${HEIGHT}" \
  --kiosk \
  "${OUTPUT_URL}" &
CHROME_PID=$!

echo "Waiting for output page to load..."
sleep 20

echo "Starting FFmpeg HLS broadcaster..."
exec ffmpeg -hide_banner -loglevel info \
  -thread_queue_size 1024 \
  -f x11grab -draw_mouse 0 -framerate "$FPS" -video_size "${WIDTH}x${HEIGHT}" -i :99.0 \
  -thread_queue_size 1024 \
  -f pulse -i tv_sink.monitor \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset ultrafast -tune zerolatency \
  -pix_fmt yuv420p -r "$FPS" -g "$((FPS * 2))" -keyint_min "$((FPS * 2))" \
  -b:v "${VIDEO_BITRATE:-2200k}" -maxrate "${VIDEO_BITRATE:-2200k}" -bufsize 4400k \
  -c:a aac -b:a "${AUDIO_BITRATE:-128k}" -ar 44100 -ac 2 \
  -f hls -hls_time 4 -hls_list_size 10 \
  -hls_flags delete_segments+append_list+independent_segments+program_date_time \
  -hls_segment_filename "/app/hls/seg_%06d.ts" \
  "/app/hls/index.m3u8"
