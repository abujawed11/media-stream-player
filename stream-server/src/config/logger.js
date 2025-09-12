import pino from "pino";

const isProd = process.env.NODE_ENV === "production";
const usePretty = !isProd && process.stdout.isTTY;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    ...(usePretty ? { transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        singleLine: false,
        ignore: "pid,hostname"
      }
    }} : {})
  }
);

