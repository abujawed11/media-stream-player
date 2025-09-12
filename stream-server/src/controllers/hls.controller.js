import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { shortId } from "../utils/ids.js";
import { ensureDirSync, join } from "../utils/files.js";
import { logger } from "../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve project root: /stream-server
const projectRoot = path.resolve(__dirname, "..", "..");
// HLS base used by BOTH FFmpeg and Express static
const hlsBase = path.resolve(projectRoot, "storage", "segments", "hls");

// Build one CRLF-joined header string (no duplicate User-Agent here)
function buildExtraHeaders() {
    const lines = [];
    if (process.env.HTTP_ACCEPT) lines.push(`Accept: ${process.env.HTTP_ACCEPT}`);
    if (process.env.HTTP_ACCEPT_LANGUAGE) lines.push(`Accept-Language: ${process.env.HTTP_ACCEPT_LANGUAGE}`);
    // keep-alive is fine
    lines.push("Connection: keep-alive");
    // IMPORTANT: end each with CRLF and join into a single -headers argument
    return lines.length ? lines.map(l => l + "\r\n").join("") : null;
}

// POST /stream/hls/start  { url }
export async function hlsStartController(req, res) {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

    const sessionId = shortId(12);
    const outDir = ensureDirSync(join(hlsBase, sessionId));

    const targetDur = Number(process.env.HLS_SEGMENT_DURATION || 4);
    const windowLen = Number(process.env.HLS_WINDOW_TARGET || 60);

    // Normalize to forward slashes for FFmpeg on Windows
    const f = (p) => p.replace(/\\/g, "/");
    const segPattern = f(join(outDir, "seg_%05d.ts"));
    const masterPath = f(join(outDir, "master.m3u8"));

    logger.info({ hlsBase, outDir, segPattern, masterPath, sessionId }, "Starting HLS");

    // Compose input options safely:
    const inputOpts = [];
    if (process.env.HTTP_USER_AGENT) inputOpts.push("-user_agent", process.env.HTTP_USER_AGENT);
    if (process.env.HTTP_REFERER) inputOpts.push("-referer", process.env.HTTP_REFERER);

    const extraHeaders = buildExtraHeaders();
    if (extraHeaders) inputOpts.push("-headers", extraHeaders);

    const cmd = ffmpeg()
        .input(url)
        .inputOptions([
            ...inputOpts,
            "-rw_timeout", String(20 * 1000 * 1000),
            "-timeout", String(20 * 1000 * 1000),
        ])
        // Transcode to guaranteed browser-safe H.264/AAC HLS (single variant for now)
        .outputOptions([
            "-map", "v:0?",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-profile:v", "main",
            "-pix_fmt", "yuv420p",
            "-g", String(targetDur * 25),
            "-sc_threshold", "0",
            "-max_muxing_queue_size", "1024",

            "-map", "a:0?",
            "-c:a", "aac",
            "-b:a", "128k",
            "-ac", "2",

            "-f", "hls",
            "-hls_time", String(targetDur),
            "-hls_list_size", "0",                  // ← keep ALL segments
            "-hls_playlist_type", "vod",            // ← VOD playlist, adds ENDLIST
            "-hls_flags", "independent_segments+program_date_time", // ← no delete_segments
            "-hls_segment_filename", segPattern,

            //   "-f", "hls",
            //   "-hls_time", String(targetDur),
            //   "-hls_list_size", String(Math.ceil(windowLen / targetDur)),
            //   "-hls_flags", "delete_segments+program_date_time",
            //   "-hls_segment_filename", segPattern,
        ])
        .output(masterPath)
        .on("start", line => logger.info({ line }, "ffmpeg start"))
        .on("stderr", line => logger.debug({ line }, "ffmpeg stderr"))
        .on("error", err => {
            logger.error({ err }, "ffmpeg error");
            if (!res.headersSent) {
                try { res.status(500).json({ ok: false, error: String(err) }); } catch { }
            }
        })
        .on("end", () => logger.info({ sessionId }, "ffmpeg end"));

    cmd.run();

    // Optional: create minimal placeholder so the path exists immediately
    try { if (!fs.existsSync(masterPath)) fs.writeFileSync(masterPath, "#EXTM3U\n"); } catch { }

    const hlsUrl = `/stream/hls/${sessionId}/master.m3u8`;
    return res.json({ ok: true, sessionId, hlsUrl });
}
