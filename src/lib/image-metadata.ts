/**
 * Removes embedded metadata from uploaded images before they are stored.
 *
 * Why: phone photos usually carry EXIF GPS coordinates. Listing photos are public,
 * so leaving EXIF in would reveal a host's exact address, which the product only
 * releases after a confirmed booking. Also drops camera serials, author names and
 * edit history. Pixel data is copied untouched.
 *
 * Trade-off: the EXIF orientation tag is removed too, so a photo that relied on it
 * may display rotated; hosts can re-upload an upright image.
 */
export class MalformedImageError extends Error {}

// JPEG APPn segments that carry metadata: APP1 (EXIF/XMP), APP13 (Photoshop/IPTC).
const JPEG_DROP = new Set([0xe1, 0xed]);

function stripJpeg(b: Buffer): Buffer {
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new MalformedImageError("not a JPEG");
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new MalformedImageError("bad JPEG marker");
    const marker = b[i + 1];
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      out.push(b.subarray(i, i + 2));
      return Buffer.concat(out);
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) throw new MalformedImageError("truncated JPEG");
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw new MalformedImageError("bad JPEG segment length");
    if (marker === 0xda) {
      // Start of scan: the rest is entropy-coded image data (plus EOI). Copy verbatim.
      out.push(b.subarray(i));
      return Buffer.concat(out);
    }
    if (!JPEG_DROP.has(marker)) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  throw new MalformedImageError("JPEG without image data");
}

// PNG chunks that carry metadata or text.
const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(b: Buffer): Buffer {
  const out: Buffer[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = b.readUInt32BE(i);
    const type = b.subarray(i + 4, i + 8).toString("latin1");
    const end = i + 12 + len;
    if (end > b.length) throw new MalformedImageError("truncated PNG chunk");
    if (!PNG_DROP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return Buffer.concat(out);
  }
  throw new MalformedImageError("PNG without IEND");
}

function stripWebp(b: Buffer): Buffer {
  if (b.subarray(0, 4).toString("latin1") !== "RIFF" || b.subarray(8, 12).toString("latin1") !== "WEBP") {
    throw new MalformedImageError("not a WebP");
  }
  const chunks: Buffer[] = [];
  let i = 12;
  while (i + 8 <= b.length) {
    const fourcc = b.subarray(i, i + 4).toString("latin1");
    const size = b.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);
    if (i + 8 + size > b.length) throw new MalformedImageError("truncated WebP chunk");
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = Buffer.from(b.subarray(i, Math.min(end, b.length)));
      // VP8X feature flags: clear the EXIF (0x08) and XMP (0x04) bits to match.
      if (fourcc === "VP8X") chunk[8] &= ~0x0c;
      chunks.push(chunk);
    }
    i = end;
  }
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, "latin1");
  return Buffer.concat([header, body]);
}

export function stripImageMetadata(buf: Buffer, mime: string): Buffer {
  if (mime === "image/jpeg") return stripJpeg(buf);
  if (mime === "image/png") return stripPng(buf);
  if (mime === "image/webp") return stripWebp(buf);
  return buf;
}
