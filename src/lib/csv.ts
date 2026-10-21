/** Minimal RFC 4180 CSV writer for finance exports. */

export type Cell = string | number | boolean | Date | null | undefined;

/**
 * Text that starts with = + - @ (or tab/CR) can run as a formula when the file is
 * opened in a spreadsheet. Such text cells are prefixed with an apostrophe. Numbers
 * are written as numbers, so negative amounts stay numeric.
 */
function cell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** Paise to a rupee amount with two decimals, as a number. */
export const rupees = (paise: number) => Math.round(paise) / 100;

export function csvResponse(filename: string, body: string) {
  return new Response("﻿" + body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
