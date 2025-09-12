import fs from "fs";
import path from "path";

export function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function join(...args) {
  return path.join(...args);
}
