const express = require("express");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const app = express();
const port = Number(process.env.PORT || 3000);
const outputUrl = process.env.OUTPUT_URL;
const hlsDir = path.join(__dirname, "hls");
fs.mkdirSync(hlsDir, { recursive: true });

let broadcaster = null;
let broadcasterStartedAt = null;
let lastExit = null;

function running() {
  return Boolean(broadcaster && broadcaster.exitCode === null && broadcaster.signalCode === null);
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

app.get("/", (req, res) => {
  const base = `${req.protocol}://${req.get("host")}`;
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Movie Max Cloud Broadcaster</title>
<style>body{font:16px Arial;max-width:760px;margin:40px auto;padding:0 18px;background:#101820;color:#f4f6f8}code{word-break:break-all;color:#8ed0ff}.card{background:#1c2a35;padding:20px;border-radius:12px;margin:16px 0}a{color:#8ed0ff}</style></head>
<body><h1>MOVIE MAX Cloud Broadcaster</h1>
<div class="card"><b>Broadcaster:</b> ${running() ? "running" : "not running"}<br>
<b>Input page:</b> <code>${escapeHtml(outputUrl || "OUTPUT_URL is not configured")}</code></div>
<div class="card"><b>HLS stream URL:</b><br><code>${base}/live/index.m3u8</code><p>The playlist appears after FFmpeg starts successfully.</p></div>
<p><a href="/health">Health status</a> · <a href="/live/index.m3u8">Open HLS playlist</a></p></body></html>`);
});

app.get("/health", (_req, res) => {
  const playlist = path.join(hlsDir, "index.m3u8");
  res.json({
    ok: true,
    outputUrlConfigured: Boolean(outputUrl),
    broadcasterRunning: running(),
    playlistExists: fs.existsSync(playlist),
    playlistBytes: fs.existsSync(playlist) ? fs.statSync(playlist).size : 0,
    startedAt: broadcasterStartedAt,
    lastExit
  });
});

app.use("/live", express.static(hlsDir, {
  setHeaders(res, filePath) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (filePath.endsWith(".m3u8")) {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    } else if (filePath.endsWith(".ts")) {
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Cache-Control", "no-store");
    }
  }
}));

app.listen(port, "0.0.0.0", () => {
  console.log(`HTTP server listening on ${port}`);
  if (!outputUrl) {
    console.error("ERROR: Set OUTPUT_URL to your public Movie Max /output URL.");
    return;
  }
  broadcaster = spawn("/app/start-broadcast.sh", [], { env: process.env, stdio: ["ignore", "inherit", "inherit"] });
  broadcasterStartedAt = new Date().toISOString();
  broadcaster.on("exit", (code, signal) => {
    lastExit = { code, signal, at: new Date().toISOString() };
    console.error("Broadcaster process exited", lastExit);
  });
});

process.on("SIGTERM", () => {
  if (broadcaster && running()) broadcaster.kill("SIGTERM");
  process.exit(0);
});
