import { SessionService } from "../services/session.service.js";
import { logger } from "../config/logger.js";

const IDLE_MS = Number(process.env.HLS_IDLE_MS || 2 * 60 * 1000);        // 2 min
const CHECK_MS = Number(process.env.HLS_CLEAN_INTERVAL_MS || 30 * 1000); // 30s
const MAX_AGE_MS = Number(process.env.HLS_MAX_AGE_MS || 60 * 60 * 1000); // 1h
const DELETE_GRACE_MS = Number(process.env.HLS_DELETE_GRACE_MS || 30 * 1000); // 30s after stop

export function startCleanupJob() {
  setInterval(async () => {
    try {
      // 1) Stop idle encoders
      const idleIds = SessionService.findIdle(IDLE_MS);
      for (const id of idleIds) {
        logger.info({ id }, "Stopping idle HLS session");
        SessionService.stop(id);
        // schedule deletion a bit later (allow file handles to close)
        setTimeout(() => {
          SessionService.deleteFolder(id)
            .then(() => logger.info({ id }, "Deleted HLS session folder"))
            .catch(() => {});
        }, DELETE_GRACE_MS);
      }

      // 2) Hard purge very old sessions (safety net)
      const oldIds = SessionService.findOlderThan(MAX_AGE_MS);
      for (const id of oldIds) {
        logger.info({ id }, "Purging old HLS session");
        SessionService.stop(id);
        setTimeout(() => {
          SessionService.deleteFolder(id)
            .then(() => logger.info({ id }, "Purged HLS session folder"))
            .catch(() => {});
        }, 5_000);
      }
    } catch (e) {
      logger.warn({ e }, "cleanup tick failed");
    }
  }, CHECK_MS);
}
