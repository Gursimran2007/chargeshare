import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getViewer } from "@/lib/auth";
import { MIME_BY_EXT, readUpload } from "@/lib/storage";

/**
 * Serves stored files with access control:
 *  - listings/<listingId>/...  public once the listing is live; otherwise host/admin only
 *  - evidence/<hostId>/...     verification documents: the host and admins only
 *  - demo/...                  bundled demo placeholders
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/files/[...path]">) {
  const { path } = await ctx.params;
  const key = path.join("/");
  const [scope, owner] = path;
  const deny = () => new NextResponse("Not found", { status: 404 });
  if (!["listings", "evidence", "demo"].includes(scope) || key.includes("..")) return deny();
  if (scope !== "demo") {
    const viewer = await getViewer();
    const isAdmin = !!viewer?.roles.includes("admin");
    if (scope === "evidence" && !(isAdmin || viewer?.userId === owner)) return deny();
    if (scope === "listings") {
      const db = await getDb();
      const { rows } = await db.query<{ status: string; host_id: string; kind: string }>(
        `select l.status::text, l.host_id, p.kind from public.charger_photos p join public.charger_listings l on l.id = p.listing_id
          where p.storage_path = $1`,
        [key],
      );
      const r = rows[0];
      if (!r) return deny();
      const isPublic = r.status === "active" && r.kind === "listing";
      if (!isPublic && !(isAdmin || viewer?.userId === r.host_id)) return deny();
    }
  } else if (!isDemoAsset(key)) {
    return deny();
  }
  const buf = await readUpload(key);
  if (!buf) return deny();
  const ext = key.split(".").pop() ?? "";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": scope === "listings" ? "public, max-age=300" : "private, no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
      // PDFs are downloaded rather than rendered in the app's origin.
      "Content-Disposition": ext === "pdf" ? `attachment; filename="document.pdf"` : "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isDemoAsset(key: string) {
  return /^demo\/[a-z0-9-]+\.(svg|png|jpg)$/.test(key);
}
