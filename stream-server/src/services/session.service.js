// Simple in-memory registry of active HLS sessions
import fs from "fs";
import path from "path";

const sessions = new Map();
// sessionId -> { cmd, outDir, startedAt, lastAccessAt, status: 'running'|'stopped' }

export const SessionService = {
    create(sessionId, cmd, outDir, originalUrl = null) {
        sessions.set(sessionId, {
            cmd,
            outDir,
            originalUrl,
            startedAt: Date.now(),
            lastAccessAt: Date.now(),
            status: "running",
            type: cmd ? "hls" : "simple", // Differentiate between HLS and simple streaming
        });
    },

    touch(sessionId) {
        const s = sessions.get(sessionId);
        if (s) s.lastAccessAt = Date.now();
    },

    stop(sessionId) {
        const s = sessions.get(sessionId);
        if (!s) return false;
        if (s.status === "running" && s.cmd) {
            try { s.cmd.kill("SIGKILL"); } catch { }
            s.status = "stopped";
        }
        return true;
    },

    get(sessionId) {
        return sessions.get(sessionId);
    },

    list() {
        return [...sessions.entries()].map(([id, v]) => ({ id, ...v }));
    },

    // Delete folder from disk (after process is stopped)
    async deleteFolder(sessionId) {
        const s = sessions.get(sessionId);
        if (!s) return;
        try {
            await fs.promises.rm(s.outDir, { recursive: true, force: true });
        } catch { }
        sessions.delete(sessionId);
    },

    // Find sessions idle longer than ms
    findIdle(ms) {
        const now = Date.now();
        const ids = [];
        sessions.forEach((s, id) => {
            if (s.type === "vod") return;                 // don't idle-stop prebuild
            if (s.type === "simple") return;              // don't idle-stop simple streaming (no processes to kill)
            if (s.status === "running" && now - s.lastAccessAt > ms) ids.push(id);
        });
        return ids;
    },

    // Find sessions old enough to purge (even if already stopped)
    findOlderThan(ms) {
        const now = Date.now();
        const ids = [];
        sessions.forEach((s, id) => {
            if (now - s.startedAt > ms) ids.push(id);
        });
        return ids;
    },

    // Find simple streaming sessions that are very old (for cleanup)
    findOldSimpleSessions(ms = 24 * 60 * 60 * 1000) { // Default 24 hours
        const now = Date.now();
        const ids = [];
        sessions.forEach((s, id) => {
            if (s.type === "simple" && now - s.startedAt > ms) {
                ids.push(id);
            }
        });
        return ids;
    },

    // Clean up simple streaming sessions (no disk cleanup needed)
    cleanupSimpleSession(sessionId) {
        const s = sessions.get(sessionId);
        if (s && s.type === "simple") {
            sessions.delete(sessionId);
            return true;
        }
        return false;
    },
};
