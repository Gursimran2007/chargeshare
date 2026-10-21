import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { AppError } from "@/lib/errors";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/jpeg": { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" },
  "application/pdf": { ext: "pdf", magic: (b) => b.subarray(0, 5).toString() === "%PDF-" },
};

export const MIME_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf", svg: "image/svg+xml" };

/**
 * Validates and stores an upload. Content is checked by magic bytes, not just
 * the declared type. Local disk in demo mode; Supabase Storage otherwise.
 */
export async function saveUpload(file: File, prefix: string, opts: { imagesOnly?: boolean } = {}) {
  if (!(file instanceof File) || file.size === 0) throw new AppError("invalid", "Choose a file to upload.");
  if (file.size > MAX_BYTES) throw new AppError("invalid", "Files must be 5 MB or smaller.");
  const t = TYPES[file.type];
  if (!t || (opts.imagesOnly && file.type === "application/pdf")) {
    throw new AppError("invalid", opts.imagesOnly ? "Upload a JPG, PNG or WebP image." : "Upload a JPG, PNG, WebP or PDF file.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (!t.magic(buf)) throw new AppError("invalid", "That file doesn't look like a valid image or PDF.");
  const key = `${prefix}/${crypto.randomUUID()}.${t.ext}`;
  if (config.supabase.url && config.supabase.serviceRoleKey) {
    const res = await fetch(`${config.supabase.url}/storage/v1/object/${config.supabase.storageBucket}/${key}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.supabase.serviceRoleKey}`, "Content-Type": file.type, "x-upsert": "false" },
      body: buf,
    });
    if (!res.ok) throw new AppError("invalid", "Upload failed. Please try again.");
  } else {
    const full = path.resolve(process.cwd(), config.uploadDir, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buf);
  }
  return key;
}

export async function readUpload(key: string): Promise<Buffer | null> {
  if (key.includes("..") || key.startsWith("/")) return null;
  if (key.startsWith("demo/")) {
    return fs.readFile(path.resolve(process.cwd(), "public", key)).catch(() => null);
  }
  if (config.supabase.url && config.supabase.serviceRoleKey) {
    const res = await fetch(`${config.supabase.url}/storage/v1/object/${config.supabase.storageBucket}/${key}`, {
      headers: { Authorization: `Bearer ${config.supabase.serviceRoleKey}` },
    });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  }
  return fs.readFile(path.resolve(process.cwd(), config.uploadDir, key)).catch(() => null);
}
