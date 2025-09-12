import dotenv from "dotenv";
dotenv.config();

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: num(process.env.PORT, 5000),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "*")
};
