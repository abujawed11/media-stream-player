import { SessionService } from "../services/session.service.js";

// Matches /stream/hls/:sessionId/...
const HLS_PREFIX = "/stream/hls/";

export function hlsAccessMiddleware(req, res, next) {
  try {
    if (req.path.startsWith(HLS_PREFIX)) {
      const rest = req.path.slice(HLS_PREFIX.length); // "<sessionId>/..."
      const parts = rest.split("/");
      const sessionId = parts[0];
      if (sessionId) SessionService.touch(sessionId);
    }
  } catch {}
  next();
}
