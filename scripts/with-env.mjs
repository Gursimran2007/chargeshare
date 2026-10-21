// Runs a command with variables from an env file:  node scripts/with-env.mjs <file> <command> [args...]
// Used instead of `node --env-file`, which Next.js build workers reject (it would be
// forwarded through NODE_OPTIONS, where it is not allowed).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const [file, cmd, ...args] = process.argv.slice(2);
if (!file || !cmd) {
  console.error("usage: node scripts/with-env.mjs <env-file> <command> [args...]");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`✗ ${file} not found. Copy .env.staging.example to it and fill it in (see docs/STAGING.md).`);
  process.exit(1);
}
process.loadEnvFile(file);
const child = spawn(cmd, args, { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => child.kill(s));
