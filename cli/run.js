#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", path.join(here, "arena-wall.ts"), ...process.argv.slice(2)],
  { stdio: "inherit" },
);
process.exit(result.status === null ? 1 : result.status);
