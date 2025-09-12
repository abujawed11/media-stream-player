// import ffmpeg from "fluent-ffmpeg";
// import path from "path";
// import fs from "fs";
// import { fileURLToPath } from "url";
// import { shortId } from "../utils/ids.js";
// import { ensureDirSync, join } from "../utils/files.js";
// import { logger } from "../config/logger.js";

// // Resolve paths
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const projectRoot = path.resolve(__dirname, "..", "..");
// const hlsBase = path.resolve(projectRoot, "storage", "segments", "hls");

// // Normalize for FFmpeg on Windows
// const f = (p) => p.replace(/\\/g, "/");

// // Build a CRLF-joined single -headers argument (avoid FFmpeg parsing bugs)
// function buildExtraHeaders() {
//     const lines = [];
//     if (process.env.HTTP_ACCEPT) lines.push(`Accept: ${process.env.HTTP_ACCEPT}`);
//     if (process.env.HTTP_ACCEPT_LANGUAGE) lines.push(`Accept-Language: ${process.env.HTTP_ACCEPT_LANGUAGE}`);
//     lines.push("Connection: keep-alive");
//     return lines.length ? lines.map(l => l + "\r\n").join("") : null;
// }

// // Choose a sensible ladder; you can tweak via env later
// function defaultRenditions() {
//     // [name, width, height, v_bitrate, v_maxrate, v_bufsize]
//     // values in kbps for rates/bufs; we’ll append 'k'
//     return [
//         ["1080p", 1920, 1080, 5000, 6000, 7500],
//         ["720p", 1280, 720, 2500, 3000, 4500],
//         ["480p", 854, 480, 1200, 1500, 2250],
//         ["360p", 640, 360, 800, 1000, 1500],
//     ];
// }

// // Optionally cap ladder based on a known source height
// function capBySourceHeight(renditions, inputHeight) {
//     if (!inputHeight) return renditions;
//     return renditions.filter(([, , h]) => h <= inputHeight + 8); // small tolerance
// }

// // POST /stream/hls/start-abr  { url, height? }
// export async function hlsStartAbrController(req, res) {
//     const { url, height } = req.body || {};
//     if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

//     const sessionId = shortId(12);
//     const outDir = ensureDirSync(join(hlsBase, sessionId));

//     // Ensure per-variant folders
//     const ladderAll = defaultRenditions();
//     const ladder = capBySourceHeight(ladderAll, Number(height) || undefined);

//     ladder.forEach((_, idx) => ensureDirSync(join(outDir, `v${idx}`)));

//     const targetDur = Number(process.env.HLS_SEGMENT_DURATION || 4);
//     const windowLen = Number(process.env.HLS_WINDOW_TARGET || 60);

//     // Build var_stream_map and FFmpeg per-variant options
//     // map like: "v:0,a:0 v:1,a:0 v:2,a:0 ..."
//     const varMap = ladder.map((_, i) => `v:${i},a:0`).join(" ");

//     // Per-variant scaling + rates
//     //   const filterVideo = ladder
//     //     .map(([, w, h], i) => `scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease:flags=bicubic[v${i}]`)
//     //     .join(";");

//     // AFTER (split + scale per branch):
//     const n = ladder.length;
//     const splitOuts = ladder.map((_, i) => `[v${i}in]`).join("");
//     // const scales = ladder
//     //     .map(([, w, h], i) => `[v${i}in]scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease:flags=bicubic[v${i}]`)
//     //     .join(";");
//     // const filterVideo = `[0:v]split=${n}${splitOuts};${scales}`;

//     const scales = ladder
//         .map(([, w, h], i) =>
//             `[v${i}in]scale=` +
//             `w=${w}:h=${h}` +
//             `:force_original_aspect_ratio=decrease` +
//             `:force_divisible_by=2` +          // <— ensure even width/height
//             `:flags=bicubic` +
//             `[v${i}]`
//         )
//         .join(";");


//     // const mapAndCodec = [];
//     // ladder.forEach(([, , , vb, mr, buf], i) => {
//     //     mapAndCodec.push(
//     //         // Map filtered video to stream index
//     //         `-map`, `[v${i}]`,
//     //         "-map", "a:0?",
//     //         // Audio always from a:0 if present
//     //         // ...(i === 0 ? ["-map", "a:0?"] : []),
//     //         `-c:v:${i}`, "libx264",
//     //         `-profile:v:${i}`, "main",
//     //         `-preset`, "veryfast",
//     //         `-pix_fmt`, "yuv420p",
//     //         `-b:v:${i}`, `${vb}k`,
//     //         `-maxrate:v:${i}`, `${mr}k`,
//     //         `-bufsize:v:${i}`, `${buf}k`,
//     //         `-g:${i}`, String(targetDur * 25),
//     //         `-sc_threshold:${i}`, "0"
//     //     );
//     // });

//     const mapAndCodec = [];
//     ladder.forEach(([, , , vb, mr, buf], i) => {
//         mapAndCodec.push(
//             // map one scaled video per variant
//             "-map", `[v${i}]`,

//             // per-variant video encode
//             `-c:v:${i}`, "libx264",
//             `-profile:v:${i}`, "main",
//             `-preset`, "veryfast",
//             `-pix_fmt`, "yuv420p",
//             `-b:v:${i}`, `${vb}k`,
//             `-maxrate:v:${i}`, `${mr}k`,
//             `-bufsize:v:${i}`, `${buf}k`,
//             `-g:${i}`, String(targetDur * 25),
//             `-sc_threshold:${i}`, "0"
//         );
//     });

//     // Single audio settings (shared)
//     // const audioOpts = [
//     //     "-c:a", "aac",
//     //     "-b:a", "128k",
//     //     "-ac", "2",
//     // ];

//     // Map a single audio stream ONCE (FFmpeg will reference it in var_stream_map)
//     const audioMapAndOpts = [
//         "-map", "0:a:0?",     // map only once
//         "-c:a:0", "aac",
//         "-b:a:0", "128k",
//         "-ac:0", "2",
//         "-disposition:a:0", "default"
//     ];

//     // Input options
//     const inputOpts = [];
//     if (process.env.HTTP_USER_AGENT) inputOpts.push("-user_agent", process.env.HTTP_USER_AGENT);
//     if (process.env.HTTP_REFERER) inputOpts.push("-referer", process.env.HTTP_REFERER);

//     const extraHeaders = buildExtraHeaders();
//     if (extraHeaders) inputOpts.push("-headers", extraHeaders);

//     const segPattern = f(join(outDir, "v%v", "seg_%05d.ts"));
//     const masterName = "master.m3u8";
//     const varPlName = "playlist.m3u8";
//     const masterPath = f(join(outDir, masterName));

//     logger.info({ outDir, sessionId, ladder: ladder.map(r => r[0]) }, "Starting ABR HLS");

//     const cmd = ffmpeg()
//         .input(url)
//         .inputOptions([
//             ...inputOpts,
//             "-rw_timeout", String(30 * 1000 * 1000),
//             "-timeout", String(30 * 1000 * 1000),
//         ])
//         // Complex filter builds N scaled video outputs: [v0][v1]...
//         .complexFilter(filterVideo)
//         // Apply per-variant maps/codecs/rates
//         .outputOptions([
//             ...mapAndCodec,
//             ...audioMapAndOpts,

//             // HLS options (TS segments for max compatibility)
//             "-f", "hls",
//             "-hls_time", String(targetDur),
//             "-hls_list_size", String(Math.ceil(windowLen / targetDur)),
//             "-hls_flags", "independent_segments+delete_segments+program_date_time",
//             "-master_pl_name", masterName,
//             "-hls_segment_filename", segPattern,
//             "-var_stream_map", varMap,
//         ])
//         // Per-variant playlist template (FFmpeg fills %v)
//         .output(f(join(outDir, "v%v", varPlName)))
//         .on("start", line => logger.info({ line }, "ffmpeg ABR start"))
//         .on("stderr", line => logger.debug({ line }, "ffmpeg ABR stderr"))
//         .on("error", err => {
//             logger.error({ err }, "ffmpeg ABR error");
//             if (!res.headersSent) {
//                 try { res.status(500).json({ ok: false, error: String(err) }); } catch { }
//             }
//         })
//         .on("end", () => logger.info({ sessionId }, "ffmpeg ABR end"));

//     // Pre-create empty master so path exists immediately (optional)
//     try { if (!fs.existsSync(masterPath)) fs.writeFileSync(masterPath, "#EXTM3U\n"); } catch { }

//     cmd.run();

//     const hlsUrl = `/stream/hls/${sessionId}/${masterName}`;
//     return res.json({ ok: true, sessionId, hlsUrl });
// }




// src/controllers/hls_abr.controller.js
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { shortId } from "../utils/ids.js";
import { ensureDirSync, join } from "../utils/files.js";
import { logger } from "../config/logger.js";
import { SessionService } from "../services/session.service.js";


// Resolve paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Project root = stream-server/
const projectRoot = path.resolve(__dirname, "..", "..");
// HLS base used by BOTH FFmpeg and Express static
const hlsBase = path.resolve(projectRoot, "storage", "segments", "hls");

// Normalize for FFmpeg on Windows
const f = (p) => p.replace(/\\/g, "/");

// Build one CRLF-joined -headers argument (avoid FFmpeg parsing bugs)
function buildExtraHeaders() {
    const lines = [];
    if (process.env.HTTP_ACCEPT) lines.push(`Accept: ${process.env.HTTP_ACCEPT}`);
    if (process.env.HTTP_ACCEPT_LANGUAGE) lines.push(`Accept-Language: ${process.env.HTTP_ACCEPT_LANGUAGE}`);
    lines.push("Connection: keep-alive");
    return lines.length ? lines.map(l => l + "\r\n").join("") : null;
}

function waitForMaster(p, ms = 5000) {
    const start = Date.now();
    return new Promise(resolve => {
        const tick = () => {
            try {
                const st = fs.statSync(p);
                if (st.size > 100) return resolve(true);
            } catch { }
            if (Date.now() - start > ms) return resolve(false);
            setTimeout(tick, 150);
        };
        tick();
    });
}

// Default ABR ladder [name, width, height, v_bitrate(k), v_maxrate(k), v_bufsize(k)]
function defaultRenditions() {
    return [
        ["1080p", 1920, 1080, 5000, 6000, 7500],
        ["720p", 1280, 720, 2500, 3000, 4500],
        ["480p", 854, 480, 1200, 1500, 2250],
        ["360p", 640, 360, 800, 1000, 1500],
    ];
}

// Optionally cap ladder by known source height
function capBySourceHeight(renditions, inputHeight) {
    if (!inputHeight) return renditions;
    return renditions.filter(([, , h]) => h <= inputHeight + 8);
}

// POST /stream/hls/start-abr  { url, height? }
export async function hlsStartAbrController(req, res) {
    const { url, height } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

    const sessionId = shortId(12);
    const outDir = ensureDirSync(join(hlsBase, sessionId));

    const ladderAll = defaultRenditions();
    const ladder = capBySourceHeight(ladderAll, Number(height) || undefined);

    // Ensure per-variant folders exist
    ladder.forEach((_, idx) => ensureDirSync(join(outDir, `v${idx}`)));

    const targetDur = Number(process.env.HLS_SEGMENT_DURATION || 4);
    const windowLen = Number(process.env.HLS_WINDOW_TARGET || 60);

    // Build var_stream_map: "v:0,a:0 v:1,a:0 ..."
    //   const varMap = ladder.map((_, i) => `v:${i},a:0`).join(" ");
    const varMap = ladder.map((_, i) => `v:${i},a:${i}`).join(" ");

    // --- build split+scale filter graph (force even dimensions) ---
    const n = ladder.length;
    const splitOuts = ladder.map((_, i) => `[v${i}in]`).join(""); // [v0in][v1in]...
    const scales = ladder
        .map(([, w, h], i) =>
            `[v${i}in]scale=` +
            `w=${w}:h=${h}` +
            `:force_original_aspect_ratio=decrease` +
            `:force_divisible_by=2` +          // ensure width/height are even for H.264
            `:flags=bicubic` +
            `[v${i}]`
        )
        .join(";");
    const filterVideo = `[0:v]split=${n}${splitOuts};${scales}`;

    // Per-variant video maps/codecs
    const mapAndCodec = [];
    ladder.forEach(([, , , vb, mr, buf], i) => {
        mapAndCodec.push(
            "-map", `[v${i}]`,
            `-c:v:${i}`, "libx264",
            `-profile:v:${i}`, "main",
            `-preset`, "veryfast",
            `-pix_fmt`, "yuv420p",
            `-b:v:${i}`, `${vb}k`,
            `-maxrate:v:${i}`, `${mr}k`,
            `-bufsize:v:${i}`, `${buf}k`,
            `-g:${i}`, String(targetDur * 25),
            `-sc_threshold:${i}`, "0"
        );
    });

    // Map ONE audio stream (optional) – all variants reference it via var_stream_map
    //   const audioMapAndOpts = [
    //     "-map", "0:a:0?",
    //     "-c:a:0", "aac",
    //     "-b:a:0", "128k",
    //     "-ac:0", "2",
    //     "-disposition:a:0", "default",
    //   ];

    // ADD this instead — duplicate audio for each variant index:
    const audioMaps = [];
    ladder.forEach((_, i) => {
        audioMaps.push(
            "-map", "0:a:0?",       // always source from the first audio in input
            `-c:a:${i}`, "aac",
            `-b:a:${i}`, "128k",
            `-ac:${i}`, "2",
            `-disposition:a:${i}`, "default"
        );
    });

    // Input options / headers
    const inputOpts = [];
    if (process.env.HTTP_USER_AGENT) inputOpts.push("-user_agent", process.env.HTTP_USER_AGENT);
    if (process.env.HTTP_REFERER) inputOpts.push("-referer", process.env.HTTP_REFERER);
    const extraHeaders = buildExtraHeaders();
    if (extraHeaders) inputOpts.push("-headers", extraHeaders);

    // Output names/patterns
    const segPattern = f(join(outDir, "v%v", "seg_%05d.ts"));
    const masterName = "master.m3u8";
    const varPlName = "playlist.m3u8";
    const masterPath = f(join(outDir, masterName));

    logger.info({ outDir, sessionId, ladder: ladder.map(r => r[0]) }, "Starting ABR HLS");

    const cmd = ffmpeg()
        .input(url)
        .inputOptions([
            ...inputOpts,
            "-rw_timeout", String(30 * 1000 * 1000),
            "-timeout", String(30 * 1000 * 1000),
        ])
        .complexFilter(filterVideo)
        .outputOptions([
            ...mapAndCodec,
            ...audioMaps,

            "-f", "hls",
            "-hls_time", String(targetDur),
            // "-hls_list_size", String(Math.ceil(windowLen / targetDur)),
            // "-hls_flags", "independent_segments+delete_segments+program_date_time",
            "-hls_list_size", "0",                          // keep ALL segments
            "-hls_playlist_type", "vod",                    // write #EXT-X-ENDLIST
            "-hls_flags", "independent_segments+program_date_time+temp_file",
            "-master_pl_name", masterName,
            "-hls_segment_filename", segPattern,
            "-var_stream_map", varMap,
        ])
        // Per-variant playlist target; FFmpeg expands %v → 0..N
        .output(f(join(outDir, "v%v", varPlName)))
        .on("start", line => logger.info({ line }, "ffmpeg ABR start"))
        .on("stderr", line => logger.debug({ line }, "ffmpeg ABR stderr"))
        .on("error", err => {
            logger.error({ err }, "ffmpeg ABR error");
            if (!res.headersSent) {
                try { res.status(500).json({ ok: false, error: String(err) }); } catch { }
            }
        })
        .on("end", () => logger.info({ sessionId }, "ffmpeg ABR end"));

    // Optional: create placeholder master so path exists immediately
    // try { if (!fs.existsSync(masterPath)) fs.writeFileSync(masterPath, "#EXTM3U\n"); } catch { }


    // ✅ Register this encoder so idle-cleanup can manage it
    SessionService.create(sessionId, cmd, outDir);

    // (optional) mark as stopped if ffmpeg exits naturally
    cmd.on("end", () => {
        logger.info({ sessionId }, "ffmpeg ABR end");
        // You can let the periodic job delete the folder,
        // or do it here if you prefer:
        // SessionService.stop(sessionId);
        // SessionService.deleteFolder(sessionId);
    });

    cmd.run();

    // ⬇️ Wait until ffmpeg has written a non-empty master.m3u8
    const ok = await waitForMaster(masterPath, 5000);
    if (!ok) {
        logger.warn({ sessionId }, "master.m3u8 not ready after 5s");
        // you can still return the URL, player may retry later
    }


    const hlsUrl = `/stream/hls/${sessionId}/${masterName}`;
    return res.json({ ok: true, sessionId, hlsUrl });
}
