"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Input, Select, buttonClass } from "@/components/ui";

const KINDS = [
  ["ledger", "Ledger entries"],
  ["bookings", "Bookings & commission"],
  ["refunds", "Refunds"],
  ["payouts", "Payouts"],
] as const;

/** Builds a download link for the admin CSV export route. */
export function ExportForm() {
  const [kind, setKind] = useState<string>("ledger");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  const href = `/api/admin/exports/${kind}${qs ? `?${qs}` : ""}`;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_160px_160px_auto] sm:items-end">
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-ink-600">Export</span>
        <Select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Export type">
          {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-ink-600">From (IST)</span>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-medium text-ink-600">To (IST)</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
      </label>
      {/* A real link to the route handler, so the browser handles the file download. */}
      <a href={href} download className={buttonClass("outline")}>
        <Download className="size-4" aria-hidden /> Download CSV
      </a>
    </div>
  );
}
