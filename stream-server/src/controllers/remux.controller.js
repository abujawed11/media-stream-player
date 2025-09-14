import ffmpeg from "fluent-ffmpeg";
import { logger } from "../config/logger.js";

// Configure FFmpeg paths from environment
if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
  console.log('FFmpeg path set to:', process.env.FFMPEG_PATH);
}
if (process.env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);
  console.log('FFprobe path set to:', process.env.FFPROBE_PATH);
}

// Build input header args to satisfy Seedr/CDN
function inputHeaders() {
  const hdrs = [];
  if (process.env.HTTP_USER_AGENT)      hdrs.push("User-Agent: " + process.env.HTTP_USER_AGENT);
  if (process.env.HTTP_REFERER)         hdrs.push("Referer: " + process.env.HTTP_REFERER);
  if (process.env.HTTP_ACCEPT)          hdrs.push("Accept: " + process.env.HTTP_ACCEPT);
  if (process.env.HTTP_ACCEPT_LANGUAGE) hdrs.push("Accept-Language: " + process.env.HTTP_ACCEPT_LANGUAGE);
  hdrs.push("Connection: keep-alive");
  return hdrs;
}

// GET /stream/remux.mp4?url=...
export async function remuxMp4Controller(req, res) {
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: "Missing ?url=" });

  logger.info({ url }, "Starting remux stream");
  
  // Set MP4 streaming-friendly headers with CORS
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");

  let ffmpegStarted = false;

  try {
    // Simplified approach - avoid complex header parsing
    logger.info("Starting FFmpeg with simplified headers");

    const cmd = ffmpeg()
      .input(url)
      .inputOptions([
        // Basic options for HTTP access
        "-user_agent", process.env.HTTP_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "-referer", process.env.HTTP_REFERER || "https://www.seedr.cc/",
        "-rw_timeout", String(30 * 1000 * 1000), // 30s timeout
        "-timeout", String(30 * 1000 * 1000),    // 30s total timeout
        "-reconnect", "1",                        // Enable reconnection
        "-reconnect_streamed", "1",               // Reconnect on streaming failure  
        "-reconnect_delay_max", "5",              // Max 5s delay between reconnects
        "-analyzeduration", "10M",                // Quick probe
        "-probesize", "10M",                      // Quick probe
      ])
      .outputOptions([
        // Map streams (handle missing streams gracefully)
        "-map", "0:v:0?",  // Map first video stream (optional)
        "-map", "0:a:0?",  // Map first audio stream (optional)
        
        // Video: copy for speed
        "-c:v", "copy",
        
        // Audio: transcode to AAC for universal browser compatibility
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "2",
        "-ar", "48000",    // Sample rate
        
        // Fragmented MP4 for instant streaming
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        
        // Streaming optimizations
        "-avoid_negative_ts", "make_zero",
        "-max_muxing_queue_size", "1024",
        "-fflags", "+genpts",
        "-reset_timestamps", "1",
      ])
      .on("start", (commandLine) => {
        ffmpegStarted = true;
        logger.info({ command: commandLine }, "FFmpeg command started");
      })
      .on("progress", (progress) => {
        logger.debug({ 
          timemark: progress.timemark,
          percent: progress.percent 
        }, "Remux progress");
      })
      .on("stderr", (stderrLine) => {
        // Log important stderr messages
        if (stderrLine.includes('error') || stderrLine.includes('Error') || 
            stderrLine.includes('failed') || stderrLine.includes('Invalid')) {
          logger.warn({ stderr: stderrLine }, "FFmpeg warning/error");
        }
      })
      .on("error", (err) => {
        logger.error({ error: err, url }, "FFmpeg remux error");
        
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: `Remux failed: ${err.message}` });
        } else {
          // If headers already sent, just end the response
          try { res.end(); } catch {}
        }
      })
      .on("end", () => {
        logger.info("Remux stream completed successfully");
      });

    // Handle client disconnection
    req.on('close', () => {
      logger.info("Client disconnected, killing FFmpeg process");
      cmd.kill('SIGKILL');
    });

    // Stream directly to response using fluent-ffmpeg's streaming
    cmd.format('mp4')
       .pipe(res, { end: true });
    
    // Handle completion
    cmd.on('end', () => {
      logger.info("FFmpeg conversion completed successfully");
    });

    // Timeout handling
    const timeout = setTimeout(() => {
      if (!ffmpegStarted) {
        logger.error("FFmpeg failed to start within 10 seconds");
        cmd.kill('SIGKILL');
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: "FFmpeg startup timeout" });
        }
      }
    }, 10000);

    // Clear timeout when FFmpeg starts
    cmd.on("start", () => clearTimeout(timeout));

  } catch (err) {
    logger.error({ error: err, url }, "Remux controller exception");
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: `Controller error: ${err.message}` });
    }
    try { res.end(); } catch {}
  }
}
