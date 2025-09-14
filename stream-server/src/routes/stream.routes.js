import { Router } from "express";
import { prepareController } from "../controllers/stream.controller.js";
import { probeUrl } from "../services/probe.service.js";
import { decidePlayback } from "../services/decision.service.js";
import { remuxMp4Controller } from "../controllers/remux.controller.js";
import ffmpeg from "fluent-ffmpeg";
import { hlsStartController } from "../controllers/hls.controller.js";
import { hlsStartAbrController } from "../controllers/hls_abr.controller.js";
import { SessionService } from "../services/session.service.js";
import { shortId } from "../utils/ids.js";

const router = Router();

// Smart streaming - automatically chooses best approach based on codec
router.post("/smart/start", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

  try {
    console.log('🧠 Smart streaming: Analyzing video for codec compatibility...');
    
    // Probe the video to detect codecs
    const meta = await probeUrl(url);
    const formatName = meta.format?.format_name || "";
    const decision = decidePlayback(meta.streams, formatName);
    
    const sessionId = shortId(12);
    console.log('📊 Codec analysis result:', {
      decision: decision.mode,
      video: meta.streams.filter(s => s.codec_type === "video").map(s => s.codec_name),
      audio: meta.streams.filter(s => s.codec_type === "audio").map(s => s.codec_name),
      format: formatName
    });

    // Store session regardless of decision
    if (SessionService && typeof SessionService.create === "function") {
      try {
        SessionService.create(sessionId, null, null, url);
        console.log('Session created for smart streaming:', sessionId);
      } catch (e) {
        console.warn("SessionService.create failed:", e);
      }
    }

    if (decision.mode === "direct") {
      // Audio/video codecs are browser-compatible, use simple streaming
      console.log('✅ Using simple streaming - audio compatible');
      const videoUrl = `/stream/simple/${sessionId}`;
      return res.json({ 
        ok: true, 
        sessionId, 
        videoUrl,
        mode: "smart-simple",
        reason: "Browser-compatible audio codec",
        audioCodec: meta.streams.filter(s => s.codec_type === "audio").map(s => s.codec_name).join(', ')
      });
    } else if (decision.mode === "remux") {
      // Need remux (matroska container but compatible codecs)
      console.log('🔄 Using remux streaming - container conversion needed');
      const videoUrl = `/stream/remux.mp4?url=${encodeURIComponent(url)}`;
      return res.json({ 
        ok: true, 
        sessionId, 
        videoUrl,
        mode: "smart-remux",
        reason: "Container conversion needed",
        audioCodec: meta.streams.filter(s => s.codec_type === "audio").map(s => s.codec_name).join(', ')
      });
    } else {
      // Incompatible audio codec - need transcoding with seeking optimization
      console.log('🎵 Using optimized remux streaming - audio transcoding needed');
      const videoUrl = `/stream/remux-seekable.mp4?url=${encodeURIComponent(url)}`;
      return res.json({ 
        ok: true, 
        sessionId, 
        videoUrl,
        mode: "smart-transcode",
        reason: "Audio codec transcoding needed",
        audioCodec: meta.streams.filter(s => s.codec_type === "audio").map(s => s.codec_name).join(', ')
      });
    }
    
  } catch (error) {
    console.error('Smart streaming analysis failed:', error);
    // Fallback to simple streaming if analysis fails
    const sessionId = shortId(12);
    if (SessionService && typeof SessionService.create === "function") {
      try {
        SessionService.create(sessionId, null, null, url);
      } catch (e) {
        console.warn("SessionService.create failed:", e);
      }
    }
    
    const videoUrl = `/stream/simple/${sessionId}`;
    return res.json({ 
      ok: true, 
      sessionId, 
      videoUrl,
      mode: "smart-fallback",
      reason: "Analysis failed, using simple streaming",
      error: error.message
    });
  }
});

// Simple video streaming - no conversion, just proxy
router.post("/simple/start", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

  const sessionId = shortId(12);
  
  console.log('Creating session:', sessionId, 'for URL:', url);
  
  // Store the URL for the proxy endpoint
  if (SessionService && typeof SessionService.create === "function") {
    try {
      SessionService.create(sessionId, null, null, url);
      console.log('Session created successfully');
      
      // Verify session was created
      const createdSession = SessionService.get(sessionId);
      console.log('Session verification:', !!createdSession, createdSession?.originalUrl);
    } catch (e) {
      console.warn("SessionService.create failed:", e);
    }
  }

  const videoUrl = `/stream/simple/${sessionId}`;
  return res.json({ 
    ok: true, 
    sessionId, 
    videoUrl,
    mode: "simple-proxy"
  });
});

// Simple video proxy - streams video directly
router.get("/simple/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const session = SessionService.get?.(sessionId);
  
  console.log('Simple streaming request for session:', sessionId);
  console.log('Session found:', !!session);
  console.log('Original URL:', session?.originalUrl);
  
  if (!session || !session.originalUrl) {
    return res.status(404).json({ ok: false, error: "Session not found" });
  }

  // Touch session to prevent idle cleanup
  SessionService.touch(sessionId);
  console.log('Session touched to prevent cleanup');

  // Handle client disconnection
  req.on('aborted', () => {
    console.log('Client disconnected from simple stream');
  });
  
  req.on('close', () => {
    console.log('Client closed simple stream connection');
  });

  try {
    const range = req.headers.range;
    const headers = {
      'User-Agent': process.env.HTTP_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': process.env.HTTP_REFERER || 'https://www.seedr.cc/',
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Accept-Encoding': 'identity' // Disable compression for better seeking
    };
    
    // Forward range requests for seeking
    if (range) {
      headers['Range'] = range;
      console.log('Range request:', range);
    }

    const response = await fetch(session.originalUrl, { headers });
    
    // Log response for debugging
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    // Set response status
    res.status(response.status);
    
    // Forward important headers
    const headersToForward = [
      'content-type', 'content-length', 'content-range', 
      'accept-ranges', 'last-modified', 'etag'
    ];
    
    headersToForward.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        res.setHeader(header, value);
        console.log(`Forwarded header ${header}:`, value);
      }
    });
    
    // Ensure accept-ranges is set for seeking support
    if (!response.headers.get('accept-ranges')) {
      res.setHeader('accept-ranges', 'bytes');
    }
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    
    // Add buffering optimizations
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Connection', 'keep-alive');
    
    // Enable better prefetching for video players
    if (response.headers.get('content-length')) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // Stream the video data with optimized chunks
    const reader = response.body.getReader();
    
    // Use a more efficient streaming approach with timeout handling
    const pump = async () => {
      try {
        let lastActivity = Date.now();
        const TIMEOUT = 30000; // 30 second timeout
        
        while (true) {
          // Add timeout for read operations
          const readPromise = reader.read();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Read timeout')), TIMEOUT)
          );
          
          const { done, value } = await Promise.race([readPromise, timeoutPromise]);
          lastActivity = Date.now();
          
          if (done) {
            console.log('Simple stream completed successfully');
            res.end();
            break;
          }
          
          // Write chunks with proper backpressure handling
          if (!res.write(value)) {
            await new Promise(resolve => res.once('drain', resolve));
          }
        }
      } catch (error) {
        console.error('Simple streaming error:', error);
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      } finally {
        try {
          reader.releaseLock();
        } catch (e) {
          // Reader might already be released
        }
      }
    };
    
    pump();
    
  } catch (error) {
    console.error('Simple streaming error:', error);
    res.status(500).json({ ok: false, error: 'Streaming failed' });
  }
});

// Prepare decides direct/proxy/remux/hls/abr based on probe
router.post("/prepare", prepareController);

// Remux-on-the-fly MP4: GET /stream/remux.mp4?url=...
router.get("/remux.mp4", remuxMp4Controller);

// Seekable remux with audio transcoding for unsupported codecs
router.get("/remux-seekable.mp4", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ ok: false, error: "Missing ?url=" });

  console.log('🎵 Starting seekable remux with audio transcoding for:', url);
  
  // Set headers for seekable MP4 streaming
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");

  let ffmpegStarted = false;

  try {
    console.log("Starting FFmpeg with seekable audio transcoding");

    const cmd = ffmpeg()
      .input(url)
      .inputOptions([
        "-user_agent", process.env.HTTP_USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "-referer", process.env.HTTP_REFERER || "https://www.seedr.cc/",
        "-rw_timeout", String(30 * 1000 * 1000), // 30s timeout
        "-timeout", String(30 * 1000 * 1000),    // 30s total timeout
        "-reconnect", "1",                        // Enable reconnection
        "-reconnect_streamed", "1",               // Reconnect on streaming failure  
        "-reconnect_delay_max", "5",              // Max 5s delay between reconnects
        "-analyzeduration", "10M",                // Quick probe
        "-probesize", "10M",                      // Quick probe
        "-fflags", "+genpts",                     // Generate PTS for seeking
        "-avoid_negative_ts", "make_zero",        // Handle timestamps for seeking
      ])
      .outputOptions([
        // Map streams (handle missing streams gracefully)
        "-map", "0:v:0?",  // Map first video stream (optional)
        "-map", "0:a:0?",  // Map first audio stream (optional)
        
        // Video: copy for speed and seeking support
        "-c:v", "copy",
        
        // Audio: ALWAYS transcode to AAC for browser compatibility
        "-c:a", "aac",
        "-b:a", "128k",
        "-ac", "2",
        "-ar", "48000",    // Sample rate
        
        // SEEKABLE Fragmented MP4 optimizations
        "-movflags", "frag_keyframe+empty_moov+default_base_moof+dash",
        
        // Seeking and streaming optimizations
        "-avoid_negative_ts", "make_zero",
        "-max_muxing_queue_size", "1024",
        "-reset_timestamps", "1",
        "-copyts",                               // Copy input timestamps
        "-start_at_zero",                        // Start timestamps at zero
        "-muxdelay", "0",                        // No mux delay for seeking
        "-muxpreload", "0",                      // No preload delay
        
        // Enable better seeking behavior
        "-fflags", "+genpts+igndts",             // Generate PTS, ignore DTS
        "-max_interleave_delta", "0",            // Better seeking support
      ])
      .on("start", (commandLine) => {
        ffmpegStarted = true;
        console.log("Seekable remux command started:", commandLine);
      })
      .on("progress", (progress) => {
        console.log('Seekable remux progress:', {
          timemark: progress.timemark,
          percent: progress.percent 
        });
      })
      .on("stderr", (stderrLine) => {
        // Log important stderr messages
        if (stderrLine.includes('error') || stderrLine.includes('Error') || 
            stderrLine.includes('failed') || stderrLine.includes('Invalid')) {
          console.warn('Seekable remux stderr:', stderrLine);
        }
      })
      .on("error", (err) => {
        console.error('Seekable remux error:', err);
        
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: `Seekable remux failed: ${err.message}` });
        } else {
          try { res.end(); } catch {}
        }
      })
      .on("end", () => {
        console.log("Seekable remux stream completed successfully");
      });

    // Handle client disconnection
    req.on('close', () => {
      console.log("Client disconnected from seekable remux, killing FFmpeg process");
      cmd.kill('SIGKILL');
    });

    // Stream directly to response
    cmd.format('mp4')
       .pipe(res, { end: true });
    
    // Timeout handling
    const timeout = setTimeout(() => {
      if (!ffmpegStarted) {
        console.error("Seekable remux FFmpeg failed to start within 10 seconds");
        cmd.kill('SIGKILL');
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: "FFmpeg startup timeout" });
        }
      }
    }, 10000);

    // Clear timeout when FFmpeg starts
    cmd.on("start", () => clearTimeout(timeout));

  } catch (err) {
    console.error('Seekable remux controller exception:', err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: `Controller error: ${err.message}` });
    }
    try { res.end(); } catch {}
  }
});

// Direct streaming (low CPU) - just proxy the video
router.get("/direct/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const session = SessionService.get?.(sessionId);
  
  if (!session || !session.originalUrl) {
    return res.status(404).json({ ok: false, error: "Session not found" });
  }

  // Touch session to prevent idle cleanup
  SessionService.touch(sessionId);

  try {
    const { default: fetch } = await import('node-fetch');
    const range = req.headers.range;
    const headers = {
      'User-Agent': process.env.HTTP_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': process.env.HTTP_REFERER || 'https://www.seedr.cc/',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };
    
    if (range) headers['Range'] = range;

    const response = await fetch(session.originalUrl, { headers });
    
    // Forward response headers
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    
    // Add buffering optimizations
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Connection', 'keep-alive');
    
    // Enable better prefetching for video players
    if (response.headers.get('content-length')) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
    
    // Stream the response with optimized chunks
    const reader = response.body.getReader();
    
    // Use a more efficient streaming approach
    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            res.end();
            break;
          }
          
          // Write chunks with proper backpressure handling
          if (!res.write(value)) {
            await new Promise(resolve => res.once('drain', resolve));
          }
        }
      } catch (error) {
        console.error('Streaming error:', error);
        res.status(500).end();
      }
    };
    
    pump();
    
  } catch (error) {
    console.error('Direct streaming error:', error);
    res.status(500).json({ ok: false, error: 'Streaming failed' });
  }
});

// Start direct streaming session
router.post("/direct/start", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: "Missing url" });

  const sessionId = shortId(12);
  
  // Store session for direct streaming (no FFmpeg needed)
  if (SessionService && typeof SessionService.create === "function") {
    try {
      SessionService.create(sessionId, null, null, url); // Store original URL
    } catch (e) {
      console.warn("SessionService.create failed:", e);
    }
  }

  const streamUrl = `/stream/direct/${sessionId}`;
  return res.json({ 
    ok: true, 
    sessionId, 
    streamUrl, 
    mode: "direct-streaming",
    note: "No conversion - streams original file directly"
  });
});

// Single-variant HLS
router.post("/hls/start", hlsStartController);

// Multi-variant (ABR) HLS
router.post("/hls/start-abr", hlsStartAbrController);

// Stop + cleanup a session
router.post("/hls/stop/:sessionId", async (req, res) => {
  const { sessionId } = req.params;
  const found = !!SessionService.get?.(sessionId);
  if (!found) return res.status(404).json({ ok: false, error: "Session not found", sessionId });

  const ok = SessionService.stop(sessionId);
  setTimeout(() => SessionService.deleteFolder(sessionId), 5_000);
  return res.json({ ok, sessionId });
});

// (Optional) quick status check
router.get("/hls/status/:sessionId", (req, res) => {
  const s = SessionService.get?.(req.params.sessionId);
  if (!s) return res.status(404).json({ ok: false, error: "Session not found" });
  return res.json({
    ok: true,
    sessionId: req.params.sessionId,
    status: s.status,
    startedAt: s.startedAt,
    lastAccessAt: s.lastAccessAt,
    outDir: s.outDir,
    originalUrl: s.originalUrl, // Add original URL to response
  });
});

// Status check for simple sessions
router.get("/simple/status/:sessionId", (req, res) => {
  const s = SessionService.get?.(req.params.sessionId);
  if (!s) return res.status(404).json({ ok: false, error: "Session not found" });
  return res.json({
    ok: true,
    sessionId: req.params.sessionId,
    status: s.status || 'active',
    startedAt: s.startedAt,
    lastAccessAt: s.lastAccessAt,
    originalUrl: s.originalUrl, // This is what we need for HLS conversion
    mode: 'simple-proxy'
  });
});

export default router;

