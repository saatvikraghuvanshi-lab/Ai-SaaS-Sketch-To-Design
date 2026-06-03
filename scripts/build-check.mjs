import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const distDir = ".next-build";

rmSync(resolve(root, distDir), { recursive: true, force: true });

const result = spawnSync("npx", ["next", "build"], {
  cwd: root,
  env: { ...process.env, NEXT_DIST_DIR: distDir },
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);