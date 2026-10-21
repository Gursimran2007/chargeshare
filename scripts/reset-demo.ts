/** Deletes the embedded demo database and uploads. The next `npm run dev` re-migrates and re-seeds. */
import fs from "node:fs";
import path from "node:path";

for (const dir of [process.env.PGLITE_DATA_DIR ?? ".data/pglite", process.env.UPLOAD_DIR ?? ".data/uploads"]) {
  fs.rmSync(path.resolve(process.cwd(), dir), { recursive: true, force: true });
  console.log(`Removed ${dir}`);
}
