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
};
