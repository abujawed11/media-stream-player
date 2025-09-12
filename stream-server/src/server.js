import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { startCleanupJob } from "./jobs/cleanup.job.js";

const server = http.createServer(app);

server.listen(env.PORT, () => {
  logger.info(`✅ API listening on http://localhost:${env.PORT}`);
  startCleanupJob();  // <— start periodic cleanup
});

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`${signal} received. Shutting down...`);
  server.close(() => {
    logger.info("HTTP server closed.");
    process.exit(0);
  });
};

["SIGINT", "SIGTERM"].forEach(sig => process.on(sig, () => shutdown(sig)));
