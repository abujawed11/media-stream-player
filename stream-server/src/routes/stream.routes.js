import { Router } from "express";
import { prepareController } from "../controllers/stream.controller.js";
import { remuxMp4Controller } from "../controllers/remux.controller.js";
import { hlsStartController } from "../controllers/hls.controller.js";
import { hlsStartAbrController } from "../controllers/hls_abr.controller.js";
import { SessionService } from "../services/session.service.js";
import { shortId } from "../utils/ids.js";

const router = Router();

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

