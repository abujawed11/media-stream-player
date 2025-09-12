import { Router } from "express";
import healthRouter from "./health.routes.js";
import streamRouter from "./stream.routes.js";
import proxyRouter from "./proxy.routes.js";

const router = Router();

router.use("/health", healthRouter);
router.use("/stream", streamRouter);
router.use("/proxy", proxyRouter);

router.get("/", (req, res) => res.json({ ok: true, name: "stream-server" }));

export default router;
