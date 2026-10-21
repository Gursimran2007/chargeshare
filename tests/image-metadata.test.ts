import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MalformedImageError, stripImageMetadata } from "@/lib/image-metadata";

const seg = (marker: number, payload: Buffer) => {
  const h = Buffer.alloc(4);
  h[0] = 0xff;
  h[1] = marker;
  h.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([h, payload]);
};
const GPS = Buffer.from("Exif\0\0GPSLatitude=13.0063;GPSLongitude=80.2551", "latin1");

describe("image metadata stripping", () => {
  it("removes EXIF/XMP and IPTC from JPEGs but keeps JFIF and image data", () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1")),
      seg(0xe1, GPS),
      seg(0xed, Buffer.from("Photoshop 3.0\0IPTC author", "latin1")),
      seg(0xdb, Buffer.alloc(65, 1)), // quantisation table
      seg(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
      Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]), // entropy-coded data
      Buffer.from([0xff, 0xd9]),
    ]);
    const out = stripImageMetadata(jpeg, "image/jpeg");
    expect(out.includes(Buffer.from("GPSLatitude"))).toBe(false);
    expect(out.includes(Buffer.from("IPTC author"))).toBe(false);
    expect(out.includes(Buffer.from("JFIF"))).toBe(true);
    expect(out.subarray(-7)).toEqual(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9]));
    expect(out.length).toBe(jpeg.length - (GPS.length + 4) - (Buffer.from("Photoshop 3.0\0IPTC author").length + 4));
  });

  it("removes eXIf and text chunks from PNGs and leaves a valid chunk sequence", () => {
    const png = fs.readFileSync(path.join(__dirname, "../e2e/fixtures/evidence.png"));
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      return Buffer.concat([len, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]);
    };
    // Insert metadata chunks right after IHDR (8 sig + 25 IHDR).
    const withMeta = Buffer.concat([png.subarray(0, 33), chunk("eXIf", GPS), chunk("tEXt", Buffer.from("Author\0Ravi")), png.subarray(33)]);
    const out = stripImageMetadata(withMeta, "image/png");
    expect(out).toEqual(png);
  });

  it("removes EXIF/XMP chunks from WebP and clears the VP8X flags", () => {
    const chunk = (fourcc: string, data: Buffer) => {
      const h = Buffer.alloc(8);
      h.write(fourcc, 0, "latin1");
      h.writeUInt32LE(data.length, 4);
      return Buffer.concat([h, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
    };
    const vp8x = Buffer.alloc(10);
    vp8x[0] = 0x0c; // EXIF + XMP flags set
    const body = Buffer.concat([chunk("VP8X", vp8x), chunk("VP8L", Buffer.alloc(9, 7)), chunk("EXIF", GPS), chunk("XMP ", Buffer.from("<x:xmpmeta/>"))]);
    const head = Buffer.alloc(12);
    head.write("RIFF", 0, "latin1");
    head.writeUInt32LE(4 + body.length, 4);
    head.write("WEBP", 8, "latin1");
    const out = stripImageMetadata(Buffer.concat([head, body]), "image/webp");
    expect(out.includes(Buffer.from("GPSLatitude"))).toBe(false);
    expect(out.includes(Buffer.from("xmpmeta"))).toBe(false);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[20] & 0x0c).toBe(0);
  });

  it("rejects truncated or malformed images instead of storing them", () => {
    expect(() => stripImageMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), "image/jpeg")).toThrow(MalformedImageError);
    expect(() => stripImageMetadata(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from([0, 0, 0, 99, 73, 72, 68, 82])]), "image/png")).toThrow(MalformedImageError);
  });
});
