// import ffmpeg from "fluent-ffmpeg";
// import path from "path";
// import { fileURLToPath } from "url";
// import fs from "fs";
// import { shortId } from "../utils/ids.js";
// import { ensureDirSync, join } from "../utils/files.js";
// import { logger } from "../config/logger.js";

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Resolve project root: /stream-server
// const projectRoot = path.resolve(__dirname, "..", "..");
// // HLS base used by BOTH FFmpeg and Express static
// const hlsBase = path.resolve(projectRoot, "storage", "segments", "hls");

// // Build one CRLF-joined header string (no duplicate User-Agent here)
// function buildExtraHeaders() {
//     const lines = [];
//     if (process.env.HTTP_ACCEPT) lines.push(`Accept: ${process.env.HTTP_ACCEPT}`);
//     if (process.env.HTTP_ACCEPT_LANGUAGE) lines.push(`Accept-Language: ${process.env.HTTP_ACCEPT_LANGUAGE}`);
//     // keep-alive is fine
//     lines.push("Connection: keep-alive");
//     // IMPORTANT: end each with CRLF and join into a single -headers argument
//     return lines.length ? lines.map(l => l + "\r\n").join("") : null;
// }

// // POST /stream/hls/start  { url }
// export async function hlsStartController(req, res) {
//     const { url } = req.body || {};
//     if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

//     const sessionId = shortId(12);
//     const outDir = ensureDirSync(join(hlsBase, sessionId));

//     const targetDur = Number(process.env.HLS_SEGMENT_DURATION || 4);
//     const windowLen = Number(process.env.HLS_WINDOW_TARGET || 60);

//     // Normalize to forward slashes for FFmpeg on Windows
//     const f = (p) => p.replace(/\\/g, "/");
//     const segPattern = f(join(outDir, "seg_%05d.ts"));
//     const masterPath = f(join(outDir, "master.m3u8"));

//     logger.info({ hlsBase, outDir, segPattern, masterPath, sessionId }, "Starting HLS");

//     // Compose input options safely:
//     const inputOpts = [];
//     if (process.env.HTTP_USER_AGENT) inputOpts.push("-user_agent", process.env.HTTP_USER_AGENT);
//     if (process.env.HTTP_REFERER) inputOpts.push("-referer", process.env.HTTP_REFERER);

//     const extraHeaders = buildExtraHeaders();
//     if (extraHeaders) inputOpts.push("-headers", extraHeaders);

//     const cmd = ffmpeg()
//         .input(url)
//         .inputOptions([
//             ...inputOpts,
//             "-rw_timeout", String(20 * 1000 * 1000),
//             "-timeout", String(20 * 1000 * 1000),
//         ])
//         // Transcode to guaranteed browser-safe H.264/AAC HLS (single variant for now)
//         .outputOptions([
//             "-map", "v:0?",
//             "-c:v", "libx264",
//             "-preset", "veryfast",
//             "-profile:v", "main",
//             "-pix_fmt", "yuv420p",
//             "-g", String(targetDur * 25),
//             "-sc_threshold", "0",
//             "-max_muxing_queue_size", "1024",

//             "-map", "a:0?",
//             "-c:a", "aac",
//             "-b:a", "128k",
//             "-ac", "2",

//             "-f", "hls",
//             "-hls_time", String(targetDur),
//             "-hls_list_size", "0",                  // ← keep ALL segments
//             "-hls_playlist_type", "vod",            // ← VOD playlist, adds ENDLIST
//             "-hls_flags", "independent_segments+program_date_time", // ← no delete_segments
//             "-hls_segment_filename", segPattern,

//             //   "-f", "hls",
//             //   "-hls_time", String(targetDur),
//             //   "-hls_list_size", String(Math.ceil(windowLen / targetDur)),
//             //   "-hls_flags", "delete_segments+program_date_time",
//             //   "-hls_segment_filename", segPattern,
//         ])
//         .output(masterPath)
//         .on("start", line => logger.info({ line }, "ffmpeg start"))
//         .on("stderr", line => logger.debug({ line }, "ffmpeg stderr"))
//         .on("error", err => {
//             logger.error({ err }, "ffmpeg error");
//             if (!res.headersSent) {
//                 try { res.status(500).json({ ok: false, error: String(err) }); } catch { }
//             }
//         })
//         .on("end", () => logger.info({ sessionId }, "ffmpeg end"));

//     cmd.run();

//     // Optional: create minimal placeholder so the path exists immediately
//     try { if (!fs.existsSync(masterPath)) fs.writeFileSync(masterPath, "#EXTM3U\n"); } catch { }

//     const hlsUrl = `/stream/hls/${sessionId}/master.m3u8`;
//     return res.json({ ok: true, sessionId, hlsUrl });
// }



// src/controllers/hls.controller.js
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { shortId } from "../utils/ids.js";
import { ensureDirSync, join } from "../utils/files.js";
import { logger } from "../config/logger.js";
// Optional: only if you created it; guard usage if not present
let SessionService = null;
try {
  // eslint-disable-next-line import/no-unresolved
  ({ SessionService } = await import("../services/session.service.js"));
} catch { /* not required */ }

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Project root = stream-server/
const projectRoot = path.resolve(__dirname, "..", "..");
// HLS base used by BOTH FFmpeg and Express static
const hlsBase = path.resolve(projectRoot, "storage", "segments", "hls");

// Normalize path for FFmpeg on Windows (forward slashes)
const f = (p) => p.replace(/\\/g, "/");

// Build one CRLF-joined -headers argument (avoid FFmpeg parsing quirks)
function buildExtraHeaders() {
  const lines = [];
  if (process.env.HTTP_ACCEPT)          lines.push(`Accept: ${process.env.HTTP_ACCEPT}`);
  if (process.env.HTTP_ACCEPT_LANGUAGE) lines.push(`Accept-Language: ${process.env.HTTP_ACCEPT_LANGUAGE}`);
  lines.push("Connection: keep-alive");
  return lines.length ? lines.map(l => l + "\r\n").join("") : null;
}

// Non-blocking helper: just to log readiness; DO NOT await before responding
function waitForMaster(p, ms = 5000) {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      try {
        const st = fs.statSync(p);
        if (st.size > 100) return resolve(true);
      } catch {}
      if (Date.now() - start > ms) return resolve(false);
      setTimeout(tick, 150);
    };
    tick();
  });
}

// POST /stream/hls/start  { url: string }
export async function hlsStartController(req, res) {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

  // Tunables (env overrides)
  const targetDur = Number(process.env.HLS_SEGMENT_DURATION || 4); // seconds

  // New session folder
  const sessionId = shortId(12);
  const outDir    = ensureDirSync(join(hlsBase, sessionId));

  const masterPath   = f(join(outDir, "master.m3u8"));
  const segPattern   = f(join(outDir, "seg_%05d.ts")); // TS segments

  logger.info({ outDir, sessionId }, "Starting single-variant HLS VOD (prefer copy video, AAC audio)");

  // Input options / headers optimized for streaming
  const inputOpts = [];
  if (process.env.HTTP_USER_AGENT) inputOpts.push("-user_agent", process.env.HTTP_USER_AGENT);
  if (process.env.HTTP_REFERER)    inputOpts.push("-referer",    process.env.HTTP_REFERER);

  const extraHeaders = buildExtraHeaders();
  if (extraHeaders) inputOpts.push("-headers", extraHeaders);

  // Optimized probe settings for faster startup and real-time processing
  inputOpts.push(
    "-analyzeduration", "5M",        // Reduce analysis time for faster startup
    "-probesize", "5M",              // Smaller probe size
    "-fflags", "+genpts+igndts",     // Generate PTS, ignore DTS for smoother streaming
    "-avoid_negative_ts", "disabled", // Don't modify timestamps
    "-max_delay", "0",               // Minimize delay
    "-thread_queue_size", "1024"     // Larger thread queue for stability
  );

  // Build command:
  // - copy video (no scaling), transcode audio to AAC (browser-safe, light CPU)
  // - full VOD playlist (list_size=0 + playlist_type=vod)
  // - TS segments for maximum compatibility
  const cmd = ffmpeg()
    .input(url)
    .inputOptions([
      ...inputOpts,
      "-rw_timeout", String(300 * 1000 * 1000), // 5 minutes in µs for long videos
      "-timeout",    String(300 * 1000 * 1000),  // 5 minutes total timeout
      "-reconnect", "1",                          // Enable reconnection
      "-reconnect_streamed", "1",                 // Reconnect on streaming failure  
      "-reconnect_delay_max", "30",               // Max 30s delay between reconnects
      "-multiple_requests", "1",                  // Enable multiple HTTP requests for ranges
      "-seekable", "1",                          // Enable seeking
    ])
    .outputOptions([
      // map primary video/audio (optional-safe)
      "-map", "v:0?",
      "-map", "a:0?",

      // keep original video track as-is (fast)
      "-c:v", "copy",

      // make audio universally playable in browsers
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",

      // HLS streaming optimized for smooth sequential playback
      "-f", "hls",
      "-hls_time", String(targetDur),
      "-hls_list_size", String(Math.max(10, Math.ceil(300 / targetDur))), // Keep 5 minutes of segments (minimum 10)
      "-hls_playlist_type", "vod",              // VOD playlist for predictable behavior
      "-hls_flags", "independent_segments+program_date_time+temp_file", // Remove append_list to prevent jumping
      "-hls_segment_filename", segPattern,
      "-hls_segment_type", "mpegts",           // Explicit TS format
      "-hls_start_number_source", "generic",   // Start numbering from 0
      "-hls_allow_cache", "1",                 // Enable caching for better performance
      "-max_muxing_queue_size", "9999",        // Large mux queue for stability
      "-avoid_negative_ts", "make_zero",       // Handle timestamp issues
      
      // Add seeking optimizations to prevent jumping
      "-copyts",                               // Copy input timestamps
      "-start_at_zero",                        // Start timestamps at zero
      "-muxdelay", "0",                        // No mux delay
      "-muxpreload", "0",                      // No preload delay
    ])
    .output(masterPath)
    .on("start", (line) => logger.info({ line }, "ffmpeg streaming conversion started"))
    .on("progress", (progress) => {
      logger.info({ 
        sessionId, 
        timemark: progress.timemark, 
        percent: progress.percent,
        currentKbps: progress.currentKbps,
        targetSize: progress.targetSize
      }, "ffmpeg progress");
    })
    .on("stderr", (line) => {
      // Log important stderr messages, filter out noise
      if (line.includes('error') || line.includes('Error') || line.includes('failed') || 
          line.includes('time=') || line.includes('speed=')) {
        logger.debug({ line, sessionId }, "ffmpeg stderr");
      }
      
      // Track when segments are being written
      if (line.includes('Opening') && line.includes('.ts')) {
        logger.debug({ sessionId, line }, "Creating new segment");
      }
    })
    .on("error", (err) => {
      logger.error({ err, sessionId }, "ffmpeg error - checking if network related");
      
      // Don't fail immediately on network errors - FFmpeg will retry with reconnect
      const errorStr = String(err).toLowerCase();
      if (errorStr.includes('timeout') || errorStr.includes('connection') || 
          errorStr.includes('network') || errorStr.includes('http')) {
        logger.warn({ sessionId, err }, "Network error detected - FFmpeg should retry with reconnect");
      }
    })
    .on("end", () => {
      logger.info({ sessionId }, "ffmpeg conversion completed");
      
      // Mark conversion as complete
      try {
        const completePath = join(outDir, "conversion_complete.marker");
        fs.writeFileSync(completePath, new Date().toISOString());
        logger.info({ sessionId }, "Marked conversion as complete");
        
        // Force regeneration of final playlist with ENDLIST
        if (fs.existsSync(masterPath)) {
          fs.unlinkSync(masterPath); // Remove cached playlist to force regeneration
        }
      } catch (e) {
        logger.error({ e, sessionId }, "Failed to mark conversion complete");
      }
    });

  // (Optional) track the session so you can stop/cleanup later
  if (SessionService && typeof SessionService.create === "function") {
    try {
      SessionService.create(sessionId, cmd, outDir);
    } catch (e) {
      logger.warn({ e }, "SessionService.create failed (continuing)");
    }
  }

  // Respond immediately (don’t block Postman/UI)
  const hlsUrl = `/stream/hls/${sessionId}/master.m3u8`;
  if (!res.headersSent) {
    res.json({ ok: true, sessionId, hlsUrl, mode: "copy-video+aac-audio", segmentType: "ts" });
  }

  // Create a minimal placeholder playlist immediately so the URL is accessible
  try {
    const placeholderPlaylist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${targetDur}`,
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "# Segments loading...",
      "#EXT-X-ENDLIST"
    ].join("\n");
    fs.writeFileSync(masterPath, placeholderPlaylist);
    logger.info({ sessionId }, "Created placeholder playlist");
  } catch (e) {
    logger.warn({ e, sessionId }, "Could not create placeholder playlist");
  }

  // Start ffmpeg right after returning the response
  setImmediate(() => cmd.run());

  // Just for logs/diagnostics — do not block the API response
  waitForMaster(masterPath, Number(process.env.HLS_VOD_WAIT_MASTER_MS || 5000))
    .then((ok) => {
      if (!ok) logger.warn({ sessionId }, "master.m3u8 not ready after wait window");
    });
}

