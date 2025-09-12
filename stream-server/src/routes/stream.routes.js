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

  try {
    const range = req.headers.range;
    const headers = {
      'User-Agent': process.env.HTTP_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': process.env.HTTP_REFERER || 'https://www.seedr.cc/',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    };
    
    // Forward range requests for seeking
    if (range) headers['Range'] = range;

    const response = await fetch(session.originalUrl, { headers });
    
    // Set response status
    res.status(response.status);
    
    // Forward important headers
    const headersToForward = [
      'content-type', 'content-length', 'content-range', 
      'accept-ranges', 'last-modified', 'etag'
    ];
    
    headersToForward.forEach(header => {
      const value = response.headers.get(header);
      if (value) res.setHeader(header, value);
    });
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    
    // Stream the video data - convert fetch ReadableStream to Node.js stream
    const reader = response.body.getReader();
    const stream = new ReadableStream({
      start(controller) {
        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
            return pump();
          });
        }
        return pump();
      }
    });

    // Convert to Node.js readable stream and pipe
    const nodeStream = new (await import('stream')).Readable.fromWeb(stream);
    nodeStream.pipe(res);
    
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
    
    // Stream the response - convert fetch ReadableStream to Node.js stream
    const reader = response.body.getReader();
    const stream = new ReadableStream({
      start(controller) {
        function pump() {
          return reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
            return pump();
          });
        }
        return pump();
      }
    });

    // Convert to Node.js readable stream and pipe
    const nodeStream = new (await import('stream')).Readable.fromWeb(stream);
    nodeStream.pipe(res);
    
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
  });
});

export default router;

